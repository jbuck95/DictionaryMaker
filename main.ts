import { App, Plugin, PluginSettingTab, Setting, TFile, Notice, Editor, Modal, DropdownComponent } from "obsidian";

interface MyPluginSettings {
    minWordLength: number;
    dictionaries: string[]; // Einfache Liste von Dateipfaden
    activeDictionary: string; // Aktiver Dateipfad
}

const DEFAULT_SETTINGS: MyPluginSettings = {
    minWordLength: 5,
    dictionaries: ["dictionary.md"],
    activeDictionary: "dictionary.md"
};

export default class ExtractWordsPlugin extends Plugin {
    settings: MyPluginSettings;

    async onload() {
        console.log("Lade ExtractWordsPlugin...");
        await this.loadSettings();

        this.addCommand({
            id: "extract-long-words",
            name: "Lange Wörter extrahieren",
            callback: async () => {
                console.log("Starte extract-long-words...");
                await this.extractAndAppendWords();
            },
        });

        this.addCommand({
            id: "sort-dictionary",
            name: "Dictionary alphabetisch sortieren",
            callback: async () => {
                console.log("Starte sort-dictionary...");
                await this.sortDictionary();
            },
        });

        this.addCommand({
            id: "append-selected-word",
            name: "Markiertes Wort zur Dictionary hinzufügen",
            editorCallback: async (editor: Editor) => {
                console.log("Starte append-selected-word...");
                await this.appendSelectedWord(editor);
            },
        });

        this.addCommand({
            id: "remove-word-from-dictionary",
            name: "Wort aus Dictionary entfernen",
            callback: async () => {
                console.log("Starte remove-word-from-dictionary...");
                await this.removeWordFromDictionary();
            },
        });

        this.addSettingTab(new ExtractWordsSettingTab(this.app, this));
        console.log("Plugin erfolgreich geladen.");
    }

    async extractAndAppendWords() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice("Keine aktive Datei gefunden.");
            console.warn("Keine aktive Datei gefunden.");
            return;
        }

        const sourceContent = await this.app.vault.read(activeFile);
        const words = this.cleanText(sourceContent);
        const longWords = words.filter(word => word.length >= this.settings.minWordLength);
        const uniqueLongWords = [...new Set(longWords)];

        const dictionaryFile = await this.getOrCreateTargetFile();
        const dictionaryContent = await this.app.vault.read(dictionaryFile);
        const existingWords = new Set(dictionaryContent.split("\n").map(line => line.trim()).filter(line => line !== ""));
        
        const wordsToAppend = uniqueLongWords.filter(word => !existingWords.has(word));
        await this.appendWords(dictionaryFile, dictionaryContent, wordsToAppend);
    }

    async sortDictionary() {
        const dictionaryFile = await this.getOrCreateTargetFile();
        const dictionaryContent = await this.app.vault.read(dictionaryFile);

        const words = dictionaryContent
            .split("\n")
            .map(word => word.trim())
            .filter(word => word !== "");

        if (words.length === 0) {
            new Notice("Dictionary ist leer.");
            console.log("Dictionary ist leer.");
            return;
        }

        const sortedWords = [...new Set(words)].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        const updatedContent = sortedWords.join("\n");
        await this.app.vault.modify(dictionaryFile, updatedContent);
        new Notice("Dictionary wurde alphabetisch sortiert.");
    }

    async appendSelectedWord(editor: Editor) {
        const selectedText = editor.getSelection().trim();
        if (!selectedText) {
            new Notice("Kein Wort markiert.");
            return;
        }

        const cleanedWord = this.cleanText(selectedText)[0];
        if (!cleanedWord) {
            new Notice("Markiertes Wort ist ungültig.");
            return;
        }

        const dictionaryFile = await this.getOrCreateTargetFile();
        const dictionaryContent = await this.app.vault.read(dictionaryFile);
        const existingWords = new Set(dictionaryContent.split("\n").map(line => line.trim()).filter(line => line !== ""));

        if (existingWords.has(cleanedWord)) {
            new Notice(`${cleanedWord} ist bereits im Dictionary.`);
            return;
        }

        const updatedContent = dictionaryContent ? `${dictionaryContent}\n${cleanedWord}` : cleanedWord;
        await this.app.vault.modify(dictionaryFile, updatedContent);
        new Notice(`${cleanedWord} wurde zum Dictionary hinzugefügt.`);
    }

    async removeWordFromDictionary() {
        const wordToRemove = await this.showRemoveWordModal();
        if (!wordToRemove) {
            new Notice("Kein Wort zum Entfernen eingegeben.");
            return;
        }

        const dictionaryFile = await this.getOrCreateTargetFile();
        const dictionaryContent = await this.app.vault.read(dictionaryFile);

        const words = dictionaryContent
            .split("\n")
            .map(word => word.trim())
            .filter(word => word !== "");

        if (words.length === 0) {
            new Notice("Dictionary ist leer.");
            return;
        }

        const cleanedWordToRemove = this.cleanText(wordToRemove)[0];
        if (!cleanedWordToRemove) {
            new Notice("Ungültiges Wort zum Entfernen.");
            return;
        }

        const existingWords = new Set(words);
        if (!existingWords.has(cleanedWordToRemove)) {
            new Notice(`${cleanedWordToRemove} wurde nicht im Dictionary gefunden.`);
            return;
        }

        const updatedWords = words.filter(word => word !== cleanedWordToRemove);
        const updatedContent = updatedWords.join("\n");
        await this.app.vault.modify(dictionaryFile, updatedContent);
        new Notice(`${cleanedWordToRemove} wurde aus dem Dictionary entfernt.`);
    }

    async showRemoveWordModal(): Promise<string | null> {
        return new Promise((resolve) => {
            class RemoveWordModal extends Modal {
                result: string | null = null;

                constructor(app: App) {
                    super(app);
                }

                onOpen() {
                    const { contentEl } = this;
                    contentEl.createEl("h2", { text: "Wort aus Dictionary entfernen" });
                    contentEl.createEl("p", { text: "Gib das Wort ein, das entfernt werden soll:" });

                    const input = contentEl.createEl("input", { type: "text" });
                    input.addEventListener("keypress", (e: KeyboardEvent) => {
                        if (e.key === "Enter") {
                            this.result = input.value.trim();
                            this.close();
                        }
                    });

                    const button = contentEl.createEl("button", { text: "Entfernen" });
                    button.addEventListener("click", () => {
                        this.result = input.value.trim();
                        this.close();
                    });
                }

                onClose() {
                    const { contentEl } = this;
                    contentEl.empty();
                    resolve(this.result);
                }
            }

            new RemoveWordModal(this.app).open();
        });
    }

    async getOrCreateTargetFile(): Promise<TFile> {
        try {
            // Hole den aktuellen Pfad aus den Einstellungen
            const path = this.settings.activeDictionary;
            let targetFile = this.app.vault.getAbstractFileByPath(path) as TFile;
            if (!targetFile) {
                console.log(`Erstelle neue Datei: ${path}`);
                targetFile = await this.app.vault.create(path, "");
            }
            return targetFile;
        } catch (error) {
            console.error("Fehler beim Erstellen/Holen der Zieldatei:", error);
            new Notice("Fehler beim Zugriff auf die Zieldatei.");
            throw error;
        }
    }

    async appendWords(file: TFile, currentContent: string, words: string[]) {
        if (words.length > 0) {
            const updatedContent = currentContent ? `${currentContent}\n${words.join("\n")}` : words.join("\n");
            await this.app.vault.modify(file, updatedContent);
            new Notice(`Hinzugefügt: ${words.length} Wörter`);
        } else {
            new Notice("Keine neuen Wörter zum Hinzufügen.");
        }
    }

    cleanText(text: string): string[] {
        // Entferne Markdown-Symbole, URLs, und Dateipfade
        const cleaned = text
            .replace(/[*_#>`-]/g, " ") // Markdown-Symbole
            .replace(/\!\[.*?\]\(.*?\)/g, "") // Bilder
            .replace(/\[.*?\]\(.*?\)/g, "") // Links
            .replace(/(https?:\/\/[^\s]+)/g, "") // URLs
            .replace(/\/?[\w\-]+?\.(png|jpg|jpeg|gif|svg|md|txt|pdf)/gi, "") // Dateipfade
            // Entferne alle Satzzeichen und Anführungszeichen
            .replace(/[.,!?;:(){}\[\]<>«»"'`´„"]/g, " ")
            // Teile in Wörter auf und filtere
            .split(/\s+/)
            .map(word => word.trim())
            // Filtere nur Wörter (Buchstaben und optionale Bindestriche)
            .filter(word => /^[a-zA-ZäöüÄÖÜß\-]+$/.test(word) && word !== "");

        return cleaned;
    }

    async loadSettings() {
        const data = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS);
        
        // Sicheres Laden der Einstellungen
        if (data && typeof data === "object") {
            if (typeof data.minWordLength === "number") {
                this.settings.minWordLength = data.minWordLength;
            }
            
            // Stelle sicher, dass dictionaries immer ein Array ist
            if (Array.isArray(data.dictionaries)) {
                // Filtere auf gültige Strings
                this.settings.dictionaries = data.dictionaries.filter((item: unknown) => typeof item === "string");
                if (this.settings.dictionaries.length === 0) {
                    this.settings.dictionaries = [...DEFAULT_SETTINGS.dictionaries];
                }
            }
            
            // Stelle sicher, dass activeDictionary existiert und in der Liste ist
            if (typeof data.activeDictionary === "string" && 
                this.settings.dictionaries.includes(data.activeDictionary)) {
                this.settings.activeDictionary = data.activeDictionary;
            } else if (this.settings.dictionaries.length > 0) {
                this.settings.activeDictionary = this.settings.dictionaries[0];
            }
        }
        
        console.log("Geladene Einstellungen:", this.settings);
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class ExtractWordsSettingTab extends PluginSettingTab {
    plugin: ExtractWordsPlugin;

    constructor(app: App, plugin: ExtractWordsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // Minimale Wortlänge-Einstellung
        new Setting(containerEl)
            .setName("Minimale Wortlänge")
            .setDesc("Mindestlänge für extrahierte Wörter (nur für automatische Extraktion)")
            .addText(text => text
                .setPlaceholder("5")
                .setValue(this.plugin.settings.minWordLength.toString())
                .onChange(async (value) => {
                    const parsed = parseInt(value);
                    if (!isNaN(parsed) && parsed >= 0) {
                        this.plugin.settings.minWordLength = parsed;
                        await this.plugin.saveSettings();
                    }
                })
            );

        // Wörterbuchauswahl
        if (!Array.isArray(this.plugin.settings.dictionaries) || this.plugin.settings.dictionaries.length === 0) {
            this.plugin.settings.dictionaries = [...DEFAULT_SETTINGS.dictionaries];
        }

        new Setting(containerEl)
            .setName("Aktives Wörterbuch")
            .setDesc("Wähle das zu bearbeitende Wörterbuch aus")
            .addDropdown(dropdown => {
                // Füge alle Wörterbücher zum Dropdown hinzu
                this.plugin.settings.dictionaries.forEach(path => {
                    // Extrahiere den Dateinamen ohne Pfad für eine bessere Anzeige
                    const displayName = path.split('/').pop() || path;
                    dropdown.addOption(path, displayName);
                });
                
                dropdown.setValue(this.plugin.settings.activeDictionary);
                dropdown.onChange(async (value) => {
                    this.plugin.settings.activeDictionary = value;
                    await this.plugin.saveSettings();
                    new Notice(`Wörterbuch gewechselt zu: ${value.split('/').pop() || value}`);
                });
            });

        // Neues Wörterbuch hinzufügen
        new Setting(containerEl)
            .setName("Neues Wörterbuch")
            .setDesc("Füge ein neues Wörterbuch hinzu (z.B. 'wörterbücher/philosophie.md')")
            .addText(text => {
                text.setPlaceholder("Pfad zur .md-Datei");
                text.onChange(async (value) => {
                    // Nur speichern, wenn Enter gedrückt wird
                    text.inputEl.addEventListener("keydown", async (e: KeyboardEvent) => {
                        if (e.key === "Enter" && value.trim() !== "") {
                            const path = value.trim();
                            // Füge .md-Erweiterung hinzu, falls nicht vorhanden
                            const correctedPath = path.endsWith(".md") ? path : `${path}.md`;
                            
                            if (!this.plugin.settings.dictionaries.includes(correctedPath)) {
                                this.plugin.settings.dictionaries.push(correctedPath);
                                this.plugin.settings.activeDictionary = correctedPath;
                                await this.plugin.saveSettings();
                                new Notice(`Neues Wörterbuch hinzugefügt: ${correctedPath}`);
                                text.setValue(""); // Feld leeren
                                this.display(); // Anzeige aktualisieren
                            } else {
                                new Notice("Dieses Wörterbuch existiert bereits!");
                            }
                        }
                    });
                });
                return text;
            })
            .addButton(button => button
                .setButtonText("Hinzufügen")
                .onClick(async () => {
                    const inputEl = button.buttonEl.parentElement?.querySelector("input") as HTMLInputElement;
                    if (inputEl && inputEl.value.trim() !== "") {
                        const path = inputEl.value.trim();
                        // Füge .md-Erweiterung hinzu, falls nicht vorhanden
                        const correctedPath = path.endsWith(".md") ? path : `${path}.md`;
                        
                        if (!this.plugin.settings.dictionaries.includes(correctedPath)) {
                            this.plugin.settings.dictionaries.push(correctedPath);
                            this.plugin.settings.activeDictionary = correctedPath;
                            await this.plugin.saveSettings();
                            new Notice(`Neues Wörterbuch hinzugefügt: ${correctedPath}`);
                            inputEl.value = ""; // Feld leeren
                            this.display(); // Anzeige aktualisieren
                        } else {
                            new Notice("Dieses Wörterbuch existiert bereits!");
                        }
                    }
                })
            );

        // Wörterbücher verwalten
        containerEl.createEl("h3", { text: "Wörterbücher verwalten" });
        
        const dictList = containerEl.createEl("div", { cls: "dictionary-list" });
        
        // Stil für die Wörterbuchliste hinzufügen
        const style = containerEl.createEl("style");
        style.textContent = `
            .dictionary-list {
                margin-top: 10px;
                margin-bottom: 20px;
            }
            .dictionary-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 5px 10px;
                margin-bottom: 5px;
                background-color: var(--background-secondary);
                border-radius: 4px;
            }
            .dictionary-item button {
                margin-left: 10px;
            }
        `;
        
        this.plugin.settings.dictionaries.forEach(path => {
            const dictItem = dictList.createEl("div", { cls: "dictionary-item" });
            
            // Zeige an, ob es das aktive Wörterbuch ist
            const isActive = path === this.plugin.settings.activeDictionary;
            const displayName = path.split('/').pop() || path;
            
            dictItem.createEl("span", { 
                text: isActive ? `📝 ${displayName}` : displayName,
                attr: { title: path }
            });
            
            // Löschen-Button
            const deleteButton = dictItem.createEl("button", { text: "Löschen" });
            deleteButton.addEventListener("click", async () => {
                // Verhindere das Löschen, wenn es das einzige Wörterbuch ist
                if (this.plugin.settings.dictionaries.length <= 1) {
                    new Notice("Das letzte Wörterbuch kann nicht gelöscht werden!");
                    return;
                }
                
                this.plugin.settings.dictionaries = this.plugin.settings.dictionaries.filter(p => p !== path);
                
                // Wechsle zu einem anderen Wörterbuch, wenn das aktive gelöscht wird
                if (isActive && this.plugin.settings.dictionaries.length > 0) {
                    this.plugin.settings.activeDictionary = this.plugin.settings.dictionaries[0];
                }
                
                await this.plugin.saveSettings();
                new Notice(`Wörterbuch entfernt: ${displayName}`);
                this.display();
            });
            
            // Aktivieren-Button (nur anzeigen, wenn nicht aktiv)
            if (!isActive) {
                const activateButton = dictItem.createEl("button", { text: "Aktivieren" });
                activateButton.addEventListener("click", async () => {
                    this.plugin.settings.activeDictionary = path;
                    await this.plugin.saveSettings();
                    new Notice(`Wörterbuch aktiviert: ${displayName}`);
                    this.display();
                });
            }
        });
    }
}