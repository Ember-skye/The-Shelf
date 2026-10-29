# The Shelf

A local media collection tracker for anime, movies, cartoons, and series. Runs entirely on your machine - a small
Python (Flask) backend serves the page and stores each collection separately
under `data/` next to `app.py`:

```
watchlist_app/
  app.py
  requirements.txt
  static/
    style.css
    app.js
  templates/
    index.html
  data/                <- created automatically
    anime/
      library.json     <- anime titles, status, scores, episode counts
      posters/         <- anime poster images
    movies/
      library.json     <- movie titles, status, scores
      posters/         <- movie poster images
    cartoons/
      library.json     <- cartoon titles, status, scores
      posters/         <- cartoon poster images
    series/
      library.json     <- series titles, status, scores
      posters/         <- series poster images
```

## Setup

```bash
cd watchlist_app
python -m venv venv          # optional but recommended
source venv/bin/activate     # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Then open **http://127.0.0.1:5000** in your browser.

## Features

- Separate Anime, Movies, Cartoons, and Series libraries with watch status, score, release year, genres, creator, and optional poster artwork.
- Anime includes watched and total episode counts. Cards show `Ep watched/total` followed by the release year when it is available.
- Search titles or genres, then filter the current library by status, genre, release year, or minimum rating.
- Sort a collection by title (A-Z), highest rating, or newest release year. The selected sort is retained when changing collections and after reloads.
- Related entries can be grouped into a stacked deck card. Decks follow the selected sort; rating and year use the highest-rated and newest entry in the deck, respectively.
- Select a card to view its entries, edit or delete an entry, reorder titles within a deck, or open a larger poster preview.

## Notes

- Anime entries have episode-watched / episode-total fields; the other collections don't.
- Poster images are uploaded straight from your device (PNG/JPG/WEBP/GIF,
  8MB max) and saved to the matching collection's `posters/` folder, named
  after the entry's internal id. Deleting or replacing an entry's poster removes
  the old file from disk.
- Light/dark mode toggle (top right) is remembered in your browser between
  visits.
- Each collection's `library.json` is plain JSON - safe to back up, sync, or
  inspect by hand. Existing combined storage is automatically split the first
  time the updated app starts.
- To move the whole collection to another computer, just copy the `data/`
  folder along with the app.
