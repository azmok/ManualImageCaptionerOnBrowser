import { _updateUI } from './main.js'


function activate_replace_panel(){
    document.addEventListener('DOMContentLoaded', ()=>{
        
        const runButton = document.getElementById('runButton');
        const input1 = document.getElementById('input1');
        const input1Label = document.getElementById('input1Label');
        const input2 = document.getElementById('input2');
        const input2Label = document.getElementById('input2Label');


        // Radio buttons and panels
        const replaceRadio = document.getElementById('choice_replace');
        const insertRadio = document.getElementById('choice_insert');
        const insertPositionPanel = document.getElementById('insertPositionPanel');
        




        // Show replace Panel
        replaceRadio.addEventListener('change', (e) => {
            if (e.target.checked) {
                const newTxt1 = input1Label.textContent.replace('search', 'replace');
                const newTxt2 = input2Label.textContent.replace('Insert', 'Replace with');
                input1Label.textContent = newTxt1;
                input2Label.textContent = newTxt2;
                insertPositionPanel.classList.remove('show');
            }
        });

        // Show insert Panel
        insertRadio.addEventListener('change', (e) => {
            if (e.target.checked) {
                const newTxt1 = input1Label.textContent.replace('replace', 'search');
                const newTxt2 = input2Label.textContent.replace('Replace with', 'Insert');
                input1Label.textContent = newTxt1;
                input2Label.textContent = newTxt2;
                insertPositionPanel.classList.add('show');
            }
        });

        // Main functionality
        runButton.addEventListener('click', () => {
            const isReplace = document.getElementById('choice_replace').checked;
            const isInsert = document.getElementById('choice_insert').checked;
            const ifAbsenceIsChecked = document.getElementById('insertIfAbsence').checked;
            const searchPattern = input1.value.trim();
            const replacementText = input2.value;
            const searchType = document.querySelector('input[name="searchType"]:checked').value;
            const position = document.querySelector('input[name="position"]:checked')?.value || 'prepend';

            const textAreas = document.body.querySelectorAll('.caption-area');

            const arr = Array.from(textAreas)
            console.log(arr.length)
            arr.map(textArea => {
                const currentText = textArea.value;
                    console.log('hi')
                    console.log( textArea.value )
                // Validation
                if (!searchPattern) {
                    alert('Please enter a search pattern.');
                    return;
                }

                if (!replacementText && !isReplace) {
                    alert('Please enter text to insert.');
                    return;
                }

                let regex;
                let newText = currentText;

                try {
                    // Create regex based on search type
                    if (searchType === 'text') {
                        // Escape special regex characters for literal text search
                        const escapedPattern = searchPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        regex = new RegExp(escapedPattern, 'g');
                    } else {
                        // Use regex pattern as provided
                        regex = new RegExp(searchPattern, 'g');
                    }

                    // Check if pattern exists
                    const matches = currentText.match(regex);
                    const patternExists = matches && matches.length > 0;

                    if (isReplace) {
                        // REPLACE functionality
                        if (!patternExists) {
                            alert('Search pattern not found in the text.');
                            return;
                        }
                        newText = currentText.replace(regex, replacementText);
                    } else if (isInsert) {
                        // INSERT functionality
                        if (ifAbsenceIsChecked) {
                            // Insert only if pattern is NOT found
                            if (!patternExists) {
                                alert('Pattern not found. Cannot insert "if absent" because there\'s nothing to insert relative to.');
                                return;
                            }
                            // For "if absent", we need to check if the replacement text is already there
                            let insertionPattern;
                            if (position === 'append') {
                                insertionPattern = new RegExp(searchPattern + '(?!' + replacementText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'g');
                            } else {
                                insertionPattern = new RegExp('(?<!' + replacementText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')' + searchPattern, 'g');
                            }
                            
                            if (position === 'append') {
                                newText = currentText.replace(regex, (match) => {
                                    // Check if replacement text already follows the match
                                    const afterMatch = currentText.substring(currentText.indexOf(match) + match.length);
                                    if (afterMatch.startsWith(replacementText)) {
                                        return match; // Don't insert if already present
                                    }
                                    return match + replacementText;
                                });
                            } else { // prepend
                                newText = currentText.replace(regex, (match) => {
                                    // Check if replacement text already precedes the match
                                    const beforeMatch = currentText.substring(0, currentText.indexOf(match));
                                    if (beforeMatch.endsWith(replacementText)) {
                                        return match; // Don't insert if already present
                                    }
                                    return replacementText + match;
                                });
                            }
                        } else {
                            // Normal insert
                            if (!patternExists) {
                                alert('Search pattern not found in the text.');
                                return;
                            }
                            
                            if (position === 'append') {
                                newText = currentText.replace(regex, (match) => match + replacementText);
                            } else { // prepend
                                newText = currentText.replace(regex, (match) => replacementText + match);
                            }
                        }
                    }

                    // Update the text
                    textAreas.value = newText;
                    console.log( textArea.value )
                    console.log( newText )
                } catch (e) {
                    alert('Invalid regex pattern: ' + e.message);
                    return;
                }
                
            });
        });
    
    });
}
activate_replace_panel();