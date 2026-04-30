"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { compareStores, formatHours } from "@/lib/compare";
import {
  applySuggestionToItem,
  clearItemProductPreferences,
  getBrandSuggestions,
  getSuggestions,
  normalizeText,
  ProductSuggestion,
} from "@/lib/fuzzy";
import { sampleZipCoordinates } from "@/lib/data";
import { freshnessPolicy, formatFreshnessWarning } from "@/lib/catalog-freshness";
import { Coordinates, ShoppingListItem } from "@/lib/types";
import { ReactNode } from "react";

const starterItems = [
  "ben and jerry's",
  "eggs large dozen",
  "coca cola 12 pack",
  "bananas",
  "paper towels",
];

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function distance(value: number) {
  return `${value.toFixed(1)} mi`;
}

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function CompareExperience({ heroAside }: { heroAside?: ReactNode }) {
  const [zipCode, setZipCode] = useState("98107");
  const [radiusMiles, setRadiusMiles] = useState(5);
  const [draftItem, setDraftItem] = useState("");
  const [draftBrand, setDraftBrand] = useState("");
  const [draftQuantity, setDraftQuantity] = useState("1");
  const [draftSelection, setDraftSelection] = useState<ProductSuggestion | null>(null);
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [isFreshnessOpen, setIsFreshnessOpen] = useState(false);
  const [activeSuggestionTarget, setActiveSuggestionTarget] = useState<string | null>(null);
  const [shoppingList, setShoppingList] = useState<ShoppingListItem[]>(
    starterItems.map((rawName) => ({
      id: createId(),
      rawName,
      quantity: 1,
    })),
  );
  const [manualLocation, setManualLocation] = useState<Coordinates | null>(null);
  const [locationLabel, setLocationLabel] = useState("Ballard, Seattle");
  const draftSuggestions = useMemo(
    () => getSuggestions([draftBrand, draftItem].filter(Boolean).join(" ")),
    [draftBrand, draftItem],
  );
  const draftBrandSuggestions = useMemo(() => getBrandSuggestions(draftBrand), [draftBrand]);

  function shouldClearDraftDetails(nextItemText: string) {
    const trimmed = nextItemText.trim();
    if (!trimmed) {
      return true;
    }

    const normalized = normalizeText(trimmed);
    const meaningfulRatio = trimmed.length ? normalized.replace(/\s/g, "").length / trimmed.length : 0;
    const hasSuggestions = getSuggestions([draftBrand, trimmed].filter(Boolean).join(" "), 1).length > 0;

    return !hasSuggestions && meaningfulRatio < 0.5;
  }

  const compareResult = useMemo(() => {
    const zipLocation = sampleZipCoordinates[zipCode];
    const resolvedLocation = manualLocation ?? zipLocation;
    if (!resolvedLocation || shoppingList.length === 0) {
      return null;
    }

    return compareStores({
      userLocation: resolvedLocation,
      radiusMiles,
      shoppingList,
      openNowOnly,
    });
  }, [manualLocation, openNowOnly, radiusMiles, shoppingList, zipCode]);

  function addItem() {
    const trimmed = draftItem.trim();
    if (!trimmed) {
      return;
    }

    const nextItem =
      draftSelection && draftItem.trim().length > 0
        ? applySuggestionToItem(
            {
              id: createId(),
              rawName: trimmed,
              quantity: Number(draftQuantity) || 1,
              preferredBrand: draftBrand.trim() || undefined,
            },
            draftSelection,
          )
        : {
            id: createId(),
            rawName: trimmed,
            quantity: Number(draftQuantity) || 1,
            preferredBrand: draftBrand.trim() || undefined,
          };

    setShoppingList((current) => [
      ...current,
      nextItem,
    ]);
    setDraftItem("");
    setDraftBrand("");
    setDraftQuantity("1");
    setDraftSelection(null);
    setActiveSuggestionTarget(null);
  }

  function closeSuggestionsSoon() {
    window.setTimeout(() => setActiveSuggestionTarget(null), 120);
  }

  function selectDraftSuggestion(suggestion: ProductSuggestion) {
    setDraftSelection(suggestion);
    setDraftItem(suggestion.productName);
    setDraftBrand(suggestion.brand);
    setActiveSuggestionTarget(null);
  }

  function selectDraftBrand(brand: string) {
    setDraftBrand(brand);
    setDraftSelection(null);
    setActiveSuggestionTarget(null);
  }

  function selectExistingSuggestion(itemId: string, suggestion: ProductSuggestion) {
    setShoppingList((current) =>
      current.map((entry) =>
        entry.id === itemId
          ? applySuggestionToItem(entry, suggestion)
          : entry,
      ),
    );
    setActiveSuggestionTarget(null);
  }

  function selectExistingBrand(itemId: string, brand: string) {
    setShoppingList((current) =>
      current.map((entry) =>
        entry.id === itemId
          ? clearItemProductPreferences({
              ...entry,
              preferredBrand: brand || undefined,
            })
          : entry,
      ),
    );
    setActiveSuggestionTarget(null);
  }

  function useZipLocation() {
    const lookup = sampleZipCoordinates[zipCode];
    if (!lookup) {
      setLocationLabel("Unknown ZIP in demo dataset");
      return;
    }

    setManualLocation({ lat: lookup.lat, lng: lookup.lng });
    setLocationLabel(`${lookup.label}, Seattle`);
  }

  function detectLocation() {
    if (!navigator.geolocation) {
      setLocationLabel("Browser location is unavailable");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setManualLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLocationLabel("Current browser location");
      },
      () => {
        setLocationLabel("Location access denied");
      },
    );
  }

  return (
    <main id="compare-tool" className="page-shell compare-page">
      <section className="hero compare-hero">
        <div className="hero-copy">
          <div className="hero-copy-layout">
            <div className="hero-copy-main">
              <div className="brand-mark">
                <Image
                  src="/cartprice-logo-with-text.png"
                  alt="CartPrice logo"
                  width={655}
                  height={730}
                  priority
                />
              </div>
              <div className="hero-copy-body">
                <h1>Compare grocery totals by store, not just shelf price.</h1>
                <p>
                  Start with your ZIP code or current location, add the items you need, and CartPrice helps
                  you compare nearby totals ahead of time so you can plan meals, budget better, and avoid
                  sticker shock at the store.
                </p>
              </div>
            </div>
            {heroAside ? <div className="compare-hero-aside">{heroAside}</div> : null}
          </div>
        </div>
      </section>

      <section className="workspace">
        <div id="controls" className="panel controls">
          <div className="panel-heading">
            <h2>Plan the trip</h2>
            <p>Set location, radius, and the list you want compared.</p>
          </div>

          <label className="field">
            <span>ZIP code</span>
            <input value={zipCode} maxLength={5} onChange={(event) => setZipCode(event.target.value)} />
          </label>

          <div className="button-row">
            <button type="button" onClick={useZipLocation}>
              Use ZIP
            </button>
            <button type="button" className="secondary" onClick={detectLocation}>
              Use my location
            </button>
          </div>

          <label className="field">
            <span>Search radius</span>
            <input
              type="range"
              min={1}
              max={15}
              step={1}
              value={radiusMiles}
              onChange={(event) => setRadiusMiles(Number(event.target.value))}
            />
            <small>{radiusMiles} miles</small>
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              checked={openNowOnly}
              onChange={(event) => setOpenNowOnly(event.target.checked)}
            />
            <span>Only show stores that are open now</span>
          </label>

          <div className="location-note">
            <span>Current comparison location</span>
            <strong>{locationLabel}</strong>
          </div>
        </div>

        <div className="panel list-builder">
          <div className="panel-heading">
            <h2>Shopping list</h2>
          </div>

          <div className="list-column-labels">
            <span>Item</span>
            <span>Brand</span>
            <span>Qty</span>
            <span>Action</span>
          </div>

          <div className="add-item-row">
            <div className="autocomplete-field">
              <input
                value={draftItem}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setDraftItem(nextValue);
                  setDraftSelection(null);
                  if (shouldClearDraftDetails(nextValue)) {
                    setDraftBrand("");
                    setDraftQuantity("");
                  }
                }}
                onFocus={() => setActiveSuggestionTarget("draft")}
                onBlur={closeSuggestionsSoon}
                placeholder="Try: ben and jerry's"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addItem();
                  }
                }}
              />
              {activeSuggestionTarget === "draft" && draftSuggestions.length > 0 ? (
                <div className="suggestion-menu">
                  {draftSuggestions.map(({ suggestion, score }) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      className="suggestion-option"
                      onMouseDown={() => selectDraftSuggestion(suggestion)}
                    >
                      <div>
                        <strong>{suggestion.productName}</strong>
                        <span>{suggestion.brand}</span>
                      </div>
                      <div className="suggestion-meta">
                        <span>{suggestion.sizeText}</span>
                        <span>{Math.round(score * 100)}% match</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="autocomplete-field">
              <input
                value={draftBrand}
                onChange={(event) => {
                  setDraftBrand(event.target.value);
                  setDraftSelection(null);
                }}
                onFocus={() => setActiveSuggestionTarget("draft-brand")}
                onBlur={closeSuggestionsSoon}
                placeholder="Brand"
              />
              {activeSuggestionTarget === "draft-brand" && draftBrandSuggestions.length > 0 ? (
                <div className="suggestion-menu">
                  {draftBrandSuggestions.map(({ suggestion, score }) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      className="suggestion-option simple"
                      onMouseDown={() => selectDraftBrand(suggestion.brand)}
                    >
                      <div>
                        <strong>{suggestion.brand}</strong>
                      </div>
                      <div className="suggestion-meta">
                        <span>{Math.round(score * 100)}% match</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <input
              type="number"
              min={1}
              value={draftQuantity}
              onChange={(event) => setDraftQuantity(event.target.value)}
              placeholder="Qty"
            />
            <button type="button" onClick={addItem}>
              Add
            </button>
          </div>

          <div className="chips">
            {starterItems.map((item) => (
              <button
                key={item}
                type="button"
                className="chip"
                onClick={() => {
                  setDraftItem(item);
                  setDraftBrand("");
                  setDraftQuantity("1");
                  setDraftSelection(null);
                  setActiveSuggestionTarget("draft");
                }}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="list">
            {shoppingList.map((item) => (
              <div className="list-item" key={item.id}>
                <div className="autocomplete-field">
                  <input
                    value={item.rawName}
                    onFocus={() => setActiveSuggestionTarget(item.id)}
                    onBlur={closeSuggestionsSoon}
                    onChange={(event) =>
                      setShoppingList((current) =>
                        current.map((entry) =>
                          entry.id === item.id
                            ? clearItemProductPreferences({ ...entry, rawName: event.target.value })
                            : entry,
                        ),
                      )
                    }
                  />
                  {activeSuggestionTarget === item.id ? (
                    <div className="suggestion-menu">
                      {getSuggestions([item.preferredBrand, item.rawName].filter(Boolean).join(" ")).map(({ suggestion, score }) => (
                        <button
                          key={suggestion.id}
                          type="button"
                          className="suggestion-option"
                          onMouseDown={() => selectExistingSuggestion(item.id, suggestion)}
                        >
                          <div>
                            <strong>{suggestion.productName}</strong>
                            <span>{suggestion.brand}</span>
                          </div>
                          <div className="suggestion-meta">
                            <span>{suggestion.sizeText}</span>
                            <span>{Math.round(score * 100)}% match</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="autocomplete-field">
                  <input
                    value={item.preferredBrand ?? ""}
                    onFocus={() => setActiveSuggestionTarget(`${item.id}-brand`)}
                    onBlur={closeSuggestionsSoon}
                    onChange={(event) =>
                      setShoppingList((current) =>
                        current.map((entry) =>
                          entry.id === item.id
                            ? clearItemProductPreferences({
                                ...entry,
                                preferredBrand: event.target.value || undefined,
                              })
                            : entry,
                        ),
                      )
                    }
                    placeholder="Brand"
                  />
                  {activeSuggestionTarget === `${item.id}-brand` ? (
                    <div className="suggestion-menu">
                      {getBrandSuggestions(item.preferredBrand ?? "").map(({ suggestion, score }) => (
                        <button
                          key={suggestion.id}
                          type="button"
                          className="suggestion-option simple"
                          onMouseDown={() => selectExistingBrand(item.id, suggestion.brand)}
                        >
                          <div>
                            <strong>{suggestion.brand}</strong>
                          </div>
                          <div className="suggestion-meta">
                            <span>{Math.round(score * 100)}% match</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(event) =>
                    setShoppingList((current) =>
                      current.map((entry) =>
                        entry.id === item.id
                          ? { ...entry, quantity: Number(event.target.value) || 1 }
                          : entry,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="ghost"
                  onClick={() =>
                    setShoppingList((current) => current.filter((entry) => entry.id !== item.id))
                  }
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="results" className="results panel">
        <div className="panel-heading results-heading">
          <div>
            <div className="results-title-row">
              <h2>Comparison results</h2>
              <div
                className="results-help"
                data-open={isFreshnessOpen ? "true" : "false"}
              >
                <button
                  type="button"
                  className="help-trigger"
                  aria-expanded={isFreshnessOpen}
                  aria-label="Show pricing transparency details"
                  onClick={() => setIsFreshnessOpen((current) => !current)}
                >
                  ?
                </button>
                <div className="results-popover">
                  <strong>Pricing transparency</strong>
                  <p>{formatFreshnessWarning()}</p>
                  <div className="freshness-grid">
                    <span>Pricing refresh target: {freshnessPolicy.priceUpdateWindow}</span>
                    <span>Stock refresh target: {freshnessPolicy.stockUpdateWindow}</span>
                    <span>High-priority items: {freshnessPolicy.highPriorityWindow}</span>
                  </div>
                </div>
              </div>
            </div>
            <p>Supported stores are ranked by estimated final total, with unsupported stores called out clearly.</p>
          </div>
          {compareResult?.cheapest ? (
            <div className="winner-banner">
              <span>Cheapest supported store</span>
              <strong>{compareResult.cheapest.store.name}</strong>
              <em>{currency(compareResult.cheapest.total)}</em>
            </div>
          ) : null}
        </div>

        {compareResult ? (
          <>
            <div className="coverage-bar">
              <span>{compareResult.coverage.searched} stores in range</span>
              <span>{compareResult.coverage.supported} with pricing</span>
              <span>{compareResult.coverage.unsupported} nearby only</span>
              {compareResult.cheapest && compareResult.nextCheapest ? (
                <span>
                  Estimated savings vs next best:{" "}
                  {currency(compareResult.nextCheapest.total - compareResult.cheapest.total)}
                </span>
              ) : null}
            </div>

            <div className="store-grid">
              {compareResult.ranked.map((result) => (
                <article className="store-card" key={result.store.id}>
                  <div className="store-card-head">
                    <div>
                      <span className="store-chain">{result.store.chain}</span>
                      <h3>{result.store.name}</h3>
                      <p>{result.store.address}</p>
                    </div>
                    <div className={`status-pill ${result.isOpenNow ? "open" : "closed"}`}>
                      {result.isOpenNow ? "Open now" : "Closed now"}
                    </div>
                  </div>

                  <div className="summary-grid">
                    <div>
                      <span>Distance</span>
                      <strong>{distance(result.distanceMiles)}</strong>
                    </div>
                    <div>
                      <span>Subtotal</span>
                      <strong>{currency(result.subtotal)}</strong>
                    </div>
                    <div>
                      <span>Sales tax</span>
                      <strong>{currency(result.salesTax)}</strong>
                    </div>
                    <div>
                      <span>Beverage tax</span>
                      <strong>{currency(result.beverageTax)}</strong>
                    </div>
                    <div>
                      <span>Bag fee</span>
                      <strong>{currency(result.bagFee)}</strong>
                    </div>
                    <div>
                      <span>Total</span>
                      <strong>{currency(result.total)}</strong>
                    </div>
                  </div>

                  <p className="hours-line">Today: {formatHours(result.store)}</p>

                  <div className="matches">
                    {result.matches.map((match) => (
                      <div className="match-row" key={match.item.id}>
                        <div>
                          <strong>{match.item.rawName}</strong>
                          {match.item.preferredBrand ? <p>Preferred brand: {match.item.preferredBrand}</p> : null}
                          <p>{match.product ? match.product.name : "No confident match"}</p>
                        </div>
                        <div className="match-meta">
                          <span>{Math.round(match.confidence * 100)}% confidence</span>
                          <span>{match.estimated ? "Estimated" : "Strong match"}</span>
                          <strong>{currency(match.lineTotal)}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              ))}

              {compareResult.unsupported.map((result) => (
                <article className="store-card unsupported" key={result.store.id}>
                  <div className="store-card-head">
                    <div>
                      <span className="store-chain">{result.store.chain}</span>
                      <h3>{result.store.name}</h3>
                      <p>{result.store.address}</p>
                    </div>
                    <div className={`status-pill ${result.isOpenNow ? "open" : "closed"}`}>
                      {result.isOpenNow ? "Open now" : "Closed now"}
                    </div>
                  </div>
                  <p className="unsupported-note">
                    Nearby store found, but pricing is unavailable in this MVP. This keeps store discovery honest
                    instead of pretending every chain has clean pricing coverage.
                  </p>
                  <p className="hours-line">Today: {formatHours(result.store)}</p>
                </article>
              ))}
            </div>
          </>
        ) : (
          <p className="empty-state">Add a location and at least one item to compare stores.</p>
        )}
      </section>
    </main>
  );
}
