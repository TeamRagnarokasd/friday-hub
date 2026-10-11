# friday-hub

Friday: app web (HUD) installabile sul telefono, con voce propria e riconoscimento della voce.

In questo repository c'è solo codice. Mai dati personali, chiavi o codici segreti.

- `index.html`: interfaccia
- `voce.js`: voce di Friday (Piper, gira nel telefono, senza limiti)
- `spk.js`, `ascolto.js`: riconoscimento di chi parla (gira nel telefono)
- `bridge.js`: parla con la funzione privata su Supabase; il codice segreto si salva una volta sola sul telefono
- `sw.js`, `manifest.webmanifest`: installazione e cache
- `data/`: modelli (voce, riconoscimento voce, motori)
