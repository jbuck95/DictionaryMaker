import { App, Plugin, PluginSettingTab, Setting, TFile } from "obsidian";

// Plugin-Einstellungen
interface MyPluginSettings {
    minWordLength: number;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
    minWordLength: 5,
};

export default class ExtractWordsPlugin extends Plugin {
    settings: MyPluginSettings;

    async onload() {
        await this.loadSettings();

        // Befehl registrieren
        this.addCommand({
            id: "extract-long-words",
            name: "Lange Wörter extrahieren und zu dictionary.md hinzufügen",
            callback: async () => {
                await this.extractAndAppendWords();
            },
        });

        // Einstellungen-Tab hinzufügen
        this.addSettingTab(new ExtractWordsSettingTab(this.app, this));
    }

    async extractAndAppendWords() {
        // Datei auswählen
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            console.warn("Keine aktive Datei gefunden.");
            return;
        }

        const sourceContent = await this.app.vault.read(activeFile);
        const words = sourceContent
            .replace(/[.,!?;:(){}\[\]<>«»"'`´]/g, "") // Satzzeichen entfernen
            .split(/\s+/);

        // Wörter filtern und Duplikate entfernen
        const longWords = words.filter(word => word.length >= this.settings.minWordLength);
        const uniqueLongWords = [...new Set(longWords)];

        // Ziel: dictionary.md finden oder erstellen
        let dictionaryFile = this.app.vault.getAbstractFileByPath("dictionary.md") as TFile;
        if (!dictionaryFile) {
            dictionaryFile = await this.app.vault.create("dictionary.md", "");
        }

        const dictionaryContent = await this.app.vault.read(dictionaryFile);
        const existingWords = new Set(dictionaryContent.split("\n").map(line => line.trim()).filter(line => line !== ""));
        
        // Nur neue Wörter anhängen
        const wordsToAppend = uniqueLongWords.filter(word => !existingWords.has(word));

        if (wordsToAppend.length > 0) {
            const updatedContent = dictionaryContent ? `${dictionaryContent}\n${wordsToAppend.join("\n")}` : wordsToAppend.join("\n");
            await this.app.vault.modify(dictionaryFile, updatedContent);
            console.log(`Folgende Wörter wurden hinzugefügt:\n${wordsToAppend.join("\n")}`);
        } else {
            console.log("Keine neuen Wörter zum Hinzufügen.");
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

// **Einstellungs-Tab für die minimale Wortlänge**
class ExtractWordsSettingTab extends PluginSettingTab {
    plugin: ExtractWordsPlugin;

    constructor(app: App, plugin: ExtractWordsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName("Minimale Wortlänge")
            .setDesc("Legt fest, wie lang ein Wort mindestens sein muss, um extrahiert zu werden.")
            .addText(text => text
                .setPlaceholder("5")
                .setValue(this.plugin.settings.minWordLength.toString())
                .onChange(async (value) => {
                    const parsed = parseInt(value);
                    if (!isNaN(parsed) && parsed > 0) {
                        this.plugin.settings.minWordLength = parsed;
                        await this.plugin.saveSettings();
                    }
                })
            );
    }
}
