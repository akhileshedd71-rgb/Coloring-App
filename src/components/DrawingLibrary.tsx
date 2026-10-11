import { forwardRef, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  Check,
  Search,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import type { Drawing, Mode, Settings } from "../types";
import { DrawingPreview } from "./DrawingPreview";
import "./drawing-library.css";

interface DrawingLibraryProps {
  drawings: Drawing[];
  categories: string[];
  mode: Mode;
  difficultyLimit: Settings["difficulty"];
  onChoose: (drawing: Drawing) => void;
}

const LIBRARY_STATE_KEY = "little-color-club.library.v2";
interface LibraryState {
  query: string;
  category: string;
  level: Settings["difficulty"];
  pagination: { key: string; limit: number };
}

function loadLibraryState(
  categories: string[],
  drawingCount: number,
): LibraryState {
  const fallback: LibraryState = {
    query: "",
    category: "All pictures",
    level: "all",
    pagination: { key: "", limit: 24 },
  };
  try {
    const saved = JSON.parse(
      sessionStorage.getItem(LIBRARY_STATE_KEY) || "null",
    ) as Partial<LibraryState> | null;
    if (!saved || typeof saved !== "object") return fallback;
    return {
      query:
        typeof saved.query === "string"
          ? saved.query.slice(0, 200)
          : fallback.query,
      category:
        typeof saved.category === "string" &&
        categories.includes(saved.category)
          ? saved.category
          : fallback.category,
      level: levels.some((level) => level.id === saved.level)
        ? saved.level!
        : fallback.level,
      pagination:
        saved.pagination &&
        typeof saved.pagination.key === "string" &&
        Number.isInteger(saved.pagination.limit) &&
        saved.pagination.limit >= 24
          ? {
              key: saved.pagination.key,
              limit: Math.min(
                saved.pagination.limit,
                Math.max(24, drawingCount),
              ),
            }
          : fallback.pagination,
    };
  } catch {
    return fallback;
  }
}

const levels = [
  {
    id: "all",
    label: "All levels",
    subtitle: "Follow your imagination",
    stars: 0,
  },
  { id: "easy", label: "Easy", subtitle: "Big shapes, little hands", stars: 1 },
  {
    id: "medium",
    label: "Medium",
    subtitle: "A little more to explore",
    stars: 2,
  },
  {
    id: "hard",
    label: "Hard",
    subtitle: "A lovely little challenge",
    stars: 3,
  },
] as const;

const categoryIcons: Record<string, string> = {
  Animals: "🐰",
  Ocean: "🐠",
  "Ocean life": "🐠",
  Nature: "🌿",
  Space: "🚀",
  Food: "🍓",
  Vehicles: "🚗",
  Fantasy: "🦄",
  Dinosaurs: "🦕",
  Bugs: "🐞",
  "Little bugs": "🐞",
  Garden: "🌷",
  "Garden friends": "🌷",
  Pets: "🐱",
  "Farm friends": "🐷",
  Farm: "🐷",
  "Wild animals": "🦁",
  Sweets: "🧁",
  "Sweet treats": "🧁",
  Yummy: "🍓",
  "On the go": "🚗",
  Magic: "🦄",
  "Happy places": "🏡",
  Places: "🏡",
  "Fairy tales": "🏰",
  Adventure: "⛺",
  Seasons: "🍂",
  Toys: "🧸",
  Flowers: "🌼",
  Patterns: "✿",
};

function LevelStars({ count }: { count: number }) {
  return (
    <span className="dl-stars" aria-hidden="true">
      {Array.from({ length: 3 }, (_, index) => (
        <Star
          key={index}
          size={13}
          fill={index < count ? "currentColor" : "none"}
          className={index < count ? "filled" : "unfilled"}
        />
      ))}
    </span>
  );
}

export const DrawingLibrary = forwardRef<HTMLElement, DrawingLibraryProps>(
  function DrawingLibrary(
    { drawings, categories, mode, difficultyLimit, onChoose },
    ref,
  ) {
    const [initialState] = useState(() =>
      loadLibraryState(categories, drawings.length),
    );
    const [query, setQuery] = useState(initialState.query);
    const [category, setCategory] = useState(initialState.category);
    const [chosenLevel, setChosenLevel] = useState<Settings["difficulty"]>(
      initialState.level,
    );
    const [pagination, setPagination] = useState(initialState.pagination);
    const difficulty =
      difficultyLimit === "all" ? chosenLevel : difficultyLimit;
    const filterKey = `${query}\u0000${category}\u0000${difficulty}`;
    const visibleLimit = pagination.key === filterKey ? pagination.limit : 24;
    const matchingDrawings = useMemo(
      () =>
        drawings.filter(
          (drawing) =>
            (category === "All pictures" || drawing.category === category) &&
            `${drawing.title} ${drawing.category}`
              .toLowerCase()
              .includes(query.trim().toLowerCase()),
        ),
      [drawings, category, query],
    );
    const filtered = useMemo(
      () =>
        matchingDrawings
          .filter(
            (drawing) =>
              difficulty === "all" || drawing.difficulty === difficulty,
          )
          .sort(
            (a, b) =>
              Number(b.source === "illustrated") -
              Number(a.source === "illustrated"),
          ),
      [matchingDrawings, difficulty],
    );
    const visible = filtered.slice(0, visibleLimit);
    useEffect(() => {
      try {
        sessionStorage.setItem(
          LIBRARY_STATE_KEY,
          JSON.stringify({ query, category, level: chosenLevel, pagination }),
        );
      } catch {
        // Browsing remains available when private mode or storage limits prevent saving filters.
      }
    }, [query, category, chosenLevel, pagination]);
    const clearFilters = () => {
      setQuery("");
      setCategory("All pictures");
      setChosenLevel("all");
    };

    return (
      <section
        className="library drawing-library"
        ref={ref}
        aria-labelledby="drawing-library-title"
      >
        <div className="dl-heading">
          <div>
            <span className="dl-eyebrow">
              <Sparkles size={14} /> YOUR COLORING BOOK
            </span>
            <h2 id="drawing-library-title">
              A world of little masterpieces<span aria-hidden="true"> ✦</span>
            </h2>
            <p>
              {mode === "number"
                ? "Find a number, match a color, make a little magic."
                : mode === "paint"
                  ? "Pick an adventure. Bring it to life your way."
                  : "Pick a picture, choose your colors, and let the fun begin."}
            </p>
          </div>
          <label className="dl-search">
            <Search size={20} aria-hidden="true" />
            <input
              aria-label="Find a picture"
              placeholder="Find a picture…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button aria-label="Clear search" onClick={() => setQuery("")}>
                <X size={18} />
              </button>
            )}
          </label>
        </div>

        <div className="dl-levels" role="group" aria-label="Drawing difficulty">
          {levels.map((level) => (
            <button
              key={level.id}
              aria-label={level.label}
              aria-pressed={difficulty === level.id}
              className={`dl-level dl-level-${level.id} ${difficulty === level.id ? "selected" : ""}`}
              disabled={
                difficultyLimit !== "all" && level.id !== difficultyLimit
              }
              onClick={() => setChosenLevel(level.id)}
            >
              <span className="dl-level-icon" aria-hidden="true">
                {level.stars ? (
                  <LevelStars count={level.stars} />
                ) : (
                  <Sparkles size={22} />
                )}
              </span>
              <span className="dl-level-copy">
                <strong>{level.label}</strong>
                <span>{level.subtitle}</span>
              </span>
              <span className="dl-level-count" aria-hidden="true">
                {
                  matchingDrawings.filter(
                    (drawing) =>
                      level.id === "all" || drawing.difficulty === level.id,
                  ).length
                }
              </span>
              {difficulty === level.id && (
                <Check
                  size={13}
                  className="dl-level-check"
                  aria-hidden="true"
                />
              )}
            </button>
          ))}
        </div>
        {difficultyLimit !== "all" && (
          <p className="dl-parent-note">
            Your grown-up has picked {difficultyLimit} pictures for you.
          </p>
        )}

        <div
          className="category-row dl-categories"
          role="group"
          aria-label="Picture categories"
        >
          {["All pictures", ...categories].map((item) => (
            <button
              key={item}
              aria-label={item}
              aria-pressed={category === item}
              className={category === item ? "selected" : ""}
              onClick={() => setCategory(item)}
            >
              <span aria-hidden="true">
                {item === "All pictures" ? "🌈" : (categoryIcons[item] ?? "✨")}
              </span>
              {item}
            </button>
          ))}
        </div>

        <div className="dl-results-heading" aria-live="polite">
          <p>
            Showing <strong>{visible.length}</strong> of{" "}
            <strong>{filtered.length}</strong> pictures
          </p>
          <span>
            <span aria-hidden="true">♡</span> A little color, a lot of joy
          </span>
        </div>

        <div className="drawing-grid dl-grid">
          {visible.map((drawing) => (
            <button
              className="drawing-card dl-card"
              key={drawing.id}
              aria-label={`${drawing.title}, ${drawing.difficulty}`}
              onClick={() => onChoose(drawing)}
            >
              <div
                className="dl-thumbnail"
                style={{ background: drawing.accent }}
              >
                <div className="dl-paper">
                  {drawing.thumbnail ? (
                    <img
                      src={drawing.thumbnail}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      width={400}
                      height={400}
                    />
                  ) : (
                    <DrawingPreview drawing={drawing} />
                  )}
                </div>
                {drawing.source === "illustrated" && (
                  <span className="dl-storybook">
                    <Sparkles size={10} aria-hidden="true" /> Storybook
                  </span>
                )}
                <span className="dl-color-arrow" aria-hidden="true">
                  <ArrowRight size={20} />
                </span>
              </div>
              <div className="drawing-card-info dl-card-info">
                <div>
                  <h3>{drawing.title}</h3>
                  <span>{drawing.category}</span>
                </div>
                <span
                  className={`difficulty ${drawing.difficulty} dl-difficulty`}
                >
                  <LevelStars
                    count={
                      levels.find((level) => level.id === drawing.difficulty)!
                        .stars
                    }
                  />
                  <span>{drawing.difficulty}</span>
                </span>
              </div>
            </button>
          ))}
        </div>

        {!filtered.length && (
          <div className="dl-empty">
            <span aria-hidden="true">🔎</span>
            <h3>No pictures found</h3>
            <p>Try another word or explore a different category.</p>
            <button onClick={clearFilters}>
              See all pictures <ArrowRight size={18} />
            </button>
          </div>
        )}
        {visible.length < filtered.length && (
          <div className="dl-load-more">
            <button
              onClick={() =>
                setPagination({ key: filterKey, limit: visibleLimit + 24 })
              }
            >
              More little adventures <ArrowDown size={18} />
            </button>
            <span>
              {filtered.length - visible.length} more pictures to discover
            </span>
          </div>
        )}
        <p className="dl-footer">
          <span aria-hidden="true">✿</span> Every masterpiece starts with “let’s
          try.” <span aria-hidden="true">✿</span>
        </p>
      </section>
    );
  },
);
