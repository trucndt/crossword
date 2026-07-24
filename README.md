# Cardword

A local, print-first crossword maker for birthday cards and small gifts. It creates a crossword from answer-clue pairs, exports physically sized PDF or SVG files, and generates shareable interactive play links.

## Run locally

```sh
npm install
npm run dev
```

Open the URL printed by Vite. Drafts are saved in browser local storage; puzzle content is not sent to a server.

## Print and cut

1. Enter one answer and clue per line using `ANSWER | Clue`.
2. Open **Print setup** and select the card size the insert should fit.
3. Use the **Shown/Hidden** switches beside Title and Note to include or remove either one.
4. Adjust the insert dimensions, grid size, and clue font size if needed.
5. Keep **US Letter** and **Cut guides** selected.
6. Export PDF or SVG and print at **Actual size** or **100% scale**.
7. Cut on the dashed insert boundary, then tape the insert to the card.

The default 4.5 x 6.5 inch insert leaves a quarter-inch margin inside a 5 x 7 inch card. Entries that cannot cross are listed in the editor and omitted from the exported clues.

## Host on GitHub Pages

This repository includes a GitHub Actions workflow that builds and deploys the app whenever `main` is pushed.

1. Create an empty repository on GitHub.
2. Connect this local project and push it:

	 ```sh
	 git add .
	 git commit -m "Add Cardword crossword maker"
	 git branch -M main
	 git remote add origin https://github.com/USERNAME/REPOSITORY.git
	 git push -u origin main
	 ```

3. Open the repository's **Settings > Pages**.
4. Under **Build and deployment**, select **GitHub Actions** as the source.
5. Open the repository's **Actions** tab and wait for **Deploy to GitHub Pages** to finish.

The site will be available at:

```text
https://USERNAME.github.io/REPOSITORY/
```

## Share an interactive puzzle

1. Open the deployed GitHub Pages site.
2. Create or reflow the puzzle.
3. Select **Copy play link** in the top bar.
4. Send the copied link to the solver.

The puzzle data is compressed into the URL after `#play=`. GitHub Pages remains fully static, so there is no database or server to operate. Copy the link from the deployed site, not `localhost`, so recipients receive the public GitHub Pages address.

The play link can also be placed in an iframe:

```html
<iframe
	src="https://USERNAME.github.io/REPOSITORY/#play=YOUR_PUZZLE_DATA"
	width="100%"
	height="760"
	style="border: 0"
	title="Interactive crossword puzzle"
></iframe>
```

Puzzle answers are present in compressed form in the URL. The links are suitable for gifts and casual sharing, but they are not secure answer storage for a competition.

## Checks

```sh
npm run build
npm run lint
```
