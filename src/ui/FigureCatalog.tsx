import React, { useState } from "react";
import { Figure, searchFigures } from "../model/FigureCatalog";
export function FigureCatalog({
  onChoose,
  onClose,
}: {
  onChoose: (figure: Figure) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const matches = searchFigures(query);
  return (
    <section className="drawscii-catalog" aria-label="Figure catalog">
      <div className="drawscii-catalog-search">
        <label htmlFor="drawscii-figure-query">Find a figure</label>
        <input
          id="drawscii-figure-query"
          type="search"
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search boxes, arrows, database, cloud…"
        />
        <span role="status">{matches.length} figures</span>
        <button onClick={onClose} aria-label="Close figure catalog">
          Close catalog
        </button>
      </div>
      <p>
        Choose a figure, move it onto the canvas, then click or press Enter to
        place it. Escape cancels.
      </p>
      <div className="drawscii-catalog-grid">
        {matches.map((figure) => (
          <button
            key={figure.id}
            className="drawscii-figure"
            onClick={() => onChoose(figure)}
            aria-label={`Place ${figure.name}`}
            title={`Place ${figure.name}`}
          >
            <strong>{figure.name}</strong>
            <span>{figure.category}</span>
            <pre aria-hidden="true">{figure.art}</pre>
          </button>
        ))}
        {!matches.length && (
          <p className="drawscii-catalog-empty">
            No figures match “{query}”. Try “box”, “arrow”, or “server”.
          </p>
        )}
      </div>
    </section>
  );
}
