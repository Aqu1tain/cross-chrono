# Cross Chrono

Chronométrage d'un cross avec des dossards à QR code. Une page web statique, sans serveur ni compte : tout reste dans le navigateur du téléphone qui scanne.

1. **Coureurs** : colle la liste (`Nom ; Course`, ou `12 ; Nom ; Course` pour fixer le numéro), ou génère seulement des numéros.
2. **Dossards** : imprime-les, quatre par page A4. Le QR code contient le numéro seul.
3. **Arrivée** : donne le départ de chaque course, puis scanne les dossards à la caméra au passage de la ligne. La saisie manuelle et une douchette code-barres marchent aussi, et « Sans dossard » note un passage à identifier plus tard.
4. **Classement** : rang et temps par course, dossards corrigeables, export CSV pour Excel.

La caméra exige une page servie en HTTPS (GitHub Pages convient) ou en `localhost`. Les librairies QR sont dans `vendor/` : une fois la page chargée, tout fonctionne sans réseau. Les données restent dans le `localStorage` de l'appareil : scanne avec un seul téléphone et exporte le CSV à la fin.

En local :

```bash
python3 -m http.server 4180
```
