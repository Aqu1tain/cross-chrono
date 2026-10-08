# Cross Chrono

Chronométrage d'un cross avec des dossards à QR code. Une page web statique, sans serveur ni compte : tout reste dans le navigateur du téléphone qui scanne.

1. **Coureurs** : colle la liste (`Nom ; Course`, ou `12 ; Nom ; Course` pour fixer le numéro), enregistre, imprime les dossards (quatre par A4).
2. **Course** : donne le départ, puis scanne les dossards à l'arrivée. La saisie au clavier et une douchette marchent aussi.
3. **Résultats** : classement par course et export CSV pour Excel.

La caméra exige une page servie en HTTPS (GitHub Pages convient) ou en `localhost`. Les librairies QR sont dans `vendor/` : une fois la page chargée, tout fonctionne sans réseau. Les données restent dans le `localStorage` de l'appareil : scanne avec un seul téléphone et exporte le CSV à la fin.

En local :

```bash
python3 -m http.server 4180
```
