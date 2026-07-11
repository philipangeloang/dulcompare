"use client";

import { useEffect, useMemo, useState } from "react";
import type { Interaction, PageEntry, Preset, Suite } from "@/lib/types";
import { suiteLabel } from "@/lib/labels";

type InteractionType = Interaction["type"];

const INTERACTION_TYPES: InteractionType[] = [
  "click",
  "select",
  "fill",
  "focus",
  "video",
  "seek",
  "scroll-to-top",
  "wait",
];

const SUITES: { value: Suite; label: string }[] = [
  { value: "seo", label: suiteLabel("seo") },
  { value: "datalayer", label: suiteLabel("datalayer") },
];

const NEW_PRESET_VALUE = "__new__";

interface DraftInteraction {
  key: string;
  type: InteractionType;
  selector: string;
  value: string;
  ms: string;
  percent: string;
}

interface DraftPage {
  key: string;
  label: string;
  path: string;
  interactions: DraftInteraction[];
  skipEventsText: string;
}

interface DraftPreset {
  id: string | null;
  name: string;
  suite: Suite;
  pages: DraftPage[];
}

let keySeed = 0;
function nextKey(): string {
  keySeed += 1;
  return `k${keySeed}`;
}

function blankInteraction(): DraftInteraction {
  return { key: nextKey(), type: "click", selector: "", value: "", ms: "", percent: "" };
}
function blankPage(): DraftPage {
  return { key: nextKey(), label: "", path: "", interactions: [], skipEventsText: "" };
}
function blankDraft(): DraftPreset {
  return { id: null, name: "", suite: "seo", pages: [] };
}

function toDraftInteraction(i: Interaction): DraftInteraction {
  const base: DraftInteraction = { key: nextKey(), type: i.type, selector: "", value: "", ms: "", percent: "" };
  switch (i.type) {
    case "click":
    case "focus":
      return { ...base, selector: i.selector };
    case "select":
      return { ...base, selector: i.selector, value: i.value ?? "" };
    case "fill":
      return { ...base, selector: i.selector, value: i.value };
    case "video":
      return { ...base, selector: i.selector ?? "" };
    case "seek":
      return { ...base, selector: i.selector ?? "", percent: String(i.percent) };
    case "wait":
      return { ...base, ms: String(i.ms) };
    case "scroll-to-top":
      return base;
  }
}

function toDraftPage(p: PageEntry): DraftPage {
  return {
    key: nextKey(),
    label: p.label,
    path: p.path,
    interactions: (p.interactions ?? []).map(toDraftInteraction),
    skipEventsText: (p.skipEvents ?? []).join(", "),
  };
}

function toDraftPreset(p: Preset): DraftPreset {
  return { id: p.id, name: p.name, suite: p.suite, pages: p.pages.map(toDraftPage) };
}

function fieldsFor(type: InteractionType) {
  return {
    selector: type !== "scroll-to-top" && type !== "wait",
    value: type === "select" || type === "fill",
    ms: type === "wait",
    percent: type === "seek",
  };
}

function validateInteraction(d: DraftInteraction): string | null {
  switch (d.type) {
    case "click":
    case "focus":
    case "select":
      return d.selector.trim() ? null : "Selector is required.";
    case "fill":
      if (!d.selector.trim()) return "Selector is required.";
      if (!d.value.trim()) return "Value is required.";
      return null;
    case "seek":
      return d.percent.trim() !== "" && !Number.isNaN(Number(d.percent))
        ? null
        : "Percent must be a number.";
    case "wait":
      return d.ms.trim() !== "" && !Number.isNaN(Number(d.ms)) ? null : "ms must be a number.";
    case "video":
    case "scroll-to-top":
      return null;
  }
}

function buildInteraction(d: DraftInteraction): Interaction {
  switch (d.type) {
    case "click":
      return { type: "click", selector: d.selector.trim() };
    case "select":
      return d.value.trim()
        ? { type: "select", selector: d.selector.trim(), value: d.value.trim() }
        : { type: "select", selector: d.selector.trim() };
    case "fill":
      return { type: "fill", selector: d.selector.trim(), value: d.value.trim() };
    case "focus":
      return { type: "focus", selector: d.selector.trim() };
    case "video":
      return d.selector.trim() ? { type: "video", selector: d.selector.trim() } : { type: "video" };
    case "seek":
      return d.selector.trim()
        ? { type: "seek", selector: d.selector.trim(), percent: Number(d.percent) }
        : { type: "seek", percent: Number(d.percent) };
    case "scroll-to-top":
      return { type: "scroll-to-top" };
    case "wait":
      return { type: "wait", ms: Number(d.ms) };
  }
}

function buildPageEntry(p: DraftPage, suite: Suite): PageEntry {
  const entry: PageEntry = { label: p.label.trim(), path: p.path.trim() };
  if (suite === "datalayer") {
    if (p.interactions.length) entry.interactions = p.interactions.map(buildInteraction);
    const skipEvents = p.skipEventsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (skipEvents.length) entry.skipEvents = skipEvents;
  }
  return entry;
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function uniqueSlug(base: string, existingIds: string[]): string {
  if (!existingIds.includes(base)) return base;
  let n = 2;
  while (existingIds.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

interface Validation {
  valid: boolean;
  nameError: string | null;
  pagesError: string | null;
  pageLabelErrors: Record<string, string | null>;
  interactionErrors: Record<string, string | null>;
}

function validateDraft(draft: DraftPreset): Validation {
  const nameError = draft.name.trim() ? null : "Name is required.";
  const pagesError = draft.pages.length ? null : "Add at least one page.";
  const pageLabelErrors: Record<string, string | null> = {};
  const interactionErrors: Record<string, string | null> = {};
  let valid = !nameError && !pagesError;

  for (const page of draft.pages) {
    const labelErr = page.label.trim() ? null : "Label is required.";
    pageLabelErrors[page.key] = labelErr;
    if (labelErr) valid = false;
    if (draft.suite === "datalayer") {
      for (const interaction of page.interactions) {
        const err = validateInteraction(interaction);
        interactionErrors[interaction.key] = err;
        if (err) valid = false;
      }
    }
  }

  return { valid, nameError, pagesError, pageLabelErrors, interactionErrors };
}

export default function PresetEditor() {
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedValue, setSelectedValue] = useState<string>(NEW_PRESET_VALUE);
  const [draft, setDraft] = useState<DraftPreset>(blankDraft());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);

  async function loadPresets(): Promise<Preset[]> {
    const res = await fetch("/api/presets", { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load presets (${res.status})`);
    return (await res.json()) as Preset[];
  }

  useEffect(() => {
    let cancelled = false;
    loadPresets()
      .then((data) => {
        if (cancelled) return;
        setPresets(data);
        if (data.length > 0) {
          setSelectedValue(data[0].id);
          setDraft(toDraftPreset(data[0]));
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function updateDraft(updater: (prev: DraftPreset) => DraftPreset) {
    setDraft(updater);
    setSaved(false);
    setSaveError(null);
  }

  function handleSelect(value: string) {
    setSelectedValue(value);
    setSaved(false);
    setSaveError(null);
    if (value === NEW_PRESET_VALUE) {
      setDraft(blankDraft());
      return;
    }
    const preset = (presets ?? []).find((p) => p.id === value);
    if (preset) setDraft(toDraftPreset(preset));
  }

  function updatePage(pageKey: string, updater: (p: DraftPage) => DraftPage) {
    updateDraft((prev) => ({ ...prev, pages: prev.pages.map((p) => (p.key === pageKey ? updater(p) : p)) }));
  }
  function updateInteraction(
    pageKey: string,
    interactionKey: string,
    updater: (i: DraftInteraction) => DraftInteraction,
  ) {
    updatePage(pageKey, (p) => ({
      ...p,
      interactions: p.interactions.map((i) => (i.key === interactionKey ? updater(i) : i)),
    }));
  }

  function addPage() {
    updateDraft((prev) => ({ ...prev, pages: [...prev.pages, blankPage()] }));
  }
  function loadBulkPages(mode: "replace" | "append") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(bulkText);
    } catch {
      setBulkError("Not valid JSON. Check for missing quotes or trailing commas.");
      return;
    }
    if (!Array.isArray(parsed)) {
      setBulkError('Expected a JSON array, e.g. [{ "label": "Home", "path": "" }].');
      return;
    }
    const newPages: DraftPage[] = [];
    try {
      parsed.forEach((item, i) => {
        if (!item || typeof item !== "object") throw new Error(`Item ${i + 1} must be an object.`);
        const rec = item as Record<string, unknown>;
        if (typeof rec.label !== "string" || typeof rec.path !== "string") {
          throw new Error(`Item ${i + 1} needs a string "label" and "path".`);
        }
        const entry: PageEntry = { label: rec.label, path: rec.path };
        if (Array.isArray(rec.interactions)) entry.interactions = rec.interactions as Interaction[];
        if (Array.isArray(rec.skipEvents)) {
          entry.skipEvents = (rec.skipEvents as unknown[]).filter((s): s is string => typeof s === "string");
        }
        newPages.push(toDraftPage(entry));
      });
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Could not parse pages.");
      return;
    }
    updateDraft((prev) => ({
      ...prev,
      pages: mode === "replace" ? newPages : [...prev.pages, ...newPages],
    }));
    setBulkError(null);
    setBulkText("");
    setBulkOpen(false);
  }
  function removePage(pageKey: string) {
    updateDraft((prev) => ({ ...prev, pages: prev.pages.filter((p) => p.key !== pageKey) }));
  }
  function addInteraction(pageKey: string) {
    updatePage(pageKey, (p) => ({ ...p, interactions: [...p.interactions, blankInteraction()] }));
  }
  function removeInteraction(pageKey: string, interactionKey: string) {
    updatePage(pageKey, (p) => ({ ...p, interactions: p.interactions.filter((i) => i.key !== interactionKey) }));
  }

  const validation = useMemo(() => validateDraft(draft), [draft]);

  async function handleDelete() {
    if (draft.id === null || deleting || saving) return;
    if (!window.confirm(`Delete preset "${draft.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    setSaveError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/presets/${draft.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setSaveError(data?.error ?? "Failed to delete preset.");
        setDeleting(false);
        return;
      }
      const fresh = await loadPresets();
      setPresets(fresh);
      if (fresh.length > 0) {
        setSelectedValue(fresh[0].id);
        setDraft(toDraftPreset(fresh[0]));
      } else {
        setSelectedValue(NEW_PRESET_VALUE);
        setDraft(blankDraft());
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  }

  async function handleSave() {
    if (!validation.valid || saving) return;
    const existingIds = (presets ?? []).map((p) => p.id);
    const id = draft.id ?? uniqueSlug(slugify(draft.name) || "preset", existingIds);
    const preset: Preset = {
      id,
      name: draft.name.trim(),
      suite: draft.suite,
      pages: draft.pages.map((p) => buildPageEntry(p, draft.suite)),
    };
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preset),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setSaveError(data?.error ?? "Failed to save preset.");
        setSaving(false);
        return;
      }
      const fresh = await loadPresets();
      setPresets(fresh);
      setSelectedValue(id);
      const savedPreset = fresh.find((p) => p.id === id);
      if (savedPreset) setDraft(toDraftPreset(savedPreset));
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="card animate-fade-up flex flex-col gap-1.5 p-6 sm:p-8">
        <label htmlFor="preset-select" className="text-xs font-medium tracking-wide text-muted uppercase">
          Preset
        </label>
        <select
          id="preset-select"
          className="input sm:max-w-sm"
          value={selectedValue}
          onChange={(e) => handleSelect(e.target.value)}
        >
          {(presets ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {suiteLabel(p.suite)} · {p.pages.length} pages
            </option>
          ))}
          <option value={NEW_PRESET_VALUE}>+ New preset</option>
        </select>
        {loadError && <p className="text-xs text-warn">{loadError}</p>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSave();
        }}
        className="card animate-fade-up animate-fade-up-2 flex flex-col gap-8 p-6 sm:p-8"
      >
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
            <label htmlFor="preset-name" className="text-xs font-medium tracking-wide text-muted uppercase">
              Name
            </label>
            <input
              id="preset-name"
              className={`input ${validation.nameError ? "input-invalid" : ""}`}
              value={draft.name}
              onChange={(e) => updateDraft((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Dulcolax SEO"
              autoComplete="off"
            />
            {validation.nameError && <p className="text-xs text-warn">{validation.nameError}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium tracking-wide text-muted uppercase">Suite</span>
            {draft.id === null ? (
              <div className="inline-flex rounded-lg border border-border bg-surface-2 p-1">
                {SUITES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => updateDraft((prev) => ({ ...prev, suite: s.value }))}
                    aria-pressed={draft.suite === s.value}
                    className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                      draft.suite === s.value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            ) : (
              <span className="inline-flex w-fit items-center rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm font-medium text-ink">
                {suiteLabel(draft.suite)}
              </span>
            )}
            {draft.id !== null && (
              <p className="max-w-[220px] text-xs text-faint">
                A preset&rsquo;s suite is fixed once created.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <h3 className="font-display text-lg text-ink">Pages</h3>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-secondary text-sm"
                onClick={() => {
                  setBulkOpen((v) => !v);
                  setBulkError(null);
                }}
              >
                Paste JSON
              </button>
              <button type="button" className="btn btn-secondary text-sm" onClick={addPage}>
                + Add page
              </button>
            </div>
          </div>

          {bulkOpen && (
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2/40 p-4">
              <label
                htmlFor="bulk-pages"
                className="text-xs font-medium tracking-wide text-muted uppercase"
              >
                Paste pages (JSON array)
              </label>
              <textarea
                id="bulk-pages"
                className="input min-h-[160px] font-mono text-xs"
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                spellCheck={false}
                placeholder={
                  '[\n  { "label": "Home", "path": "" },\n  { "label": "Products", "path": "products" }\n]'
                }
              />
              <p className="text-xs text-faint">
                An array of {"{ label, path }"} objects. For dataLayer presets you can also include{" "}
                <span className="font-mono">interactions</span> and{" "}
                <span className="font-mono">skipEvents</span> per page.
              </p>
              {bulkError && <p className="text-xs text-warn">{bulkError}</p>}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary text-sm"
                  onClick={() => loadBulkPages("replace")}
                  disabled={!bulkText.trim()}
                >
                  Replace pages
                </button>
                <button
                  type="button"
                  className="btn btn-secondary text-sm"
                  onClick={() => loadBulkPages("append")}
                  disabled={!bulkText.trim()}
                >
                  Append
                </button>
                <button
                  type="button"
                  className="btn btn-secondary text-sm"
                  onClick={() => {
                    setBulkOpen(false);
                    setBulkError(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {validation.pagesError && <p className="text-xs text-warn">{validation.pagesError}</p>}
          {draft.pages.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
              No pages yet. Add one to get started.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {draft.pages.map((page, idx) => (
                <PageRow
                  key={page.key}
                  page={page}
                  index={idx}
                  suite={draft.suite}
                  labelError={validation.pageLabelErrors[page.key] ?? null}
                  interactionErrors={validation.interactionErrors}
                  onLabelChange={(v) => updatePage(page.key, (p) => ({ ...p, label: v }))}
                  onPathChange={(v) => updatePage(page.key, (p) => ({ ...p, path: v }))}
                  onSkipEventsChange={(v) => updatePage(page.key, (p) => ({ ...p, skipEventsText: v }))}
                  onRemove={() => removePage(page.key)}
                  onAddInteraction={() => addInteraction(page.key)}
                  onRemoveInteraction={(ik) => removeInteraction(page.key, ik)}
                  onInteractionChange={(ik, updater) => updateInteraction(page.key, ik, updater)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
          <div className="flex items-center gap-4">
            {draft.id !== null && (
              <button
                type="button"
                className="btn btn-secondary text-warn text-sm"
                onClick={() => void handleDelete()}
                disabled={deleting || saving}
              >
                {deleting ? "Deleting…" : "Delete preset"}
              </button>
            )}
            <div className="min-h-[1.25rem] text-sm">
              {saveError ? (
                <span className="text-warn">{saveError}</span>
              ) : saved ? (
                <span className="text-match">Saved ✓</span>
              ) : null}
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={!validation.valid || saving}>
            {saving ? "Saving…" : "Save preset"}
          </button>
        </div>
      </form>
    </div>
  );
}

function PageRow({
  page,
  index,
  suite,
  labelError,
  interactionErrors,
  onLabelChange,
  onPathChange,
  onSkipEventsChange,
  onRemove,
  onAddInteraction,
  onRemoveInteraction,
  onInteractionChange,
}: {
  page: DraftPage;
  index: number;
  suite: Suite;
  labelError: string | null;
  interactionErrors: Record<string, string | null>;
  onLabelChange: (v: string) => void;
  onPathChange: (v: string) => void;
  onSkipEventsChange: (v: string) => void;
  onRemove: () => void;
  onAddInteraction: () => void;
  onRemoveInteraction: (interactionKey: string) => void;
  onInteractionChange: (interactionKey: string, updater: (i: DraftInteraction) => DraftInteraction) => void;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface-2/40 p-4">
      <div className="flex flex-wrap items-start gap-4">
        <span className="stat mt-2.5 text-xs text-faint">{String(index + 1).padStart(2, "0")}</span>
        <div className="flex min-w-[160px] flex-1 flex-col gap-1.5">
          <label htmlFor={`page-${index}-label`} className="text-xs font-medium tracking-wide text-muted uppercase">
            Label
          </label>
          <input
            id={`page-${index}-label`}
            className={`input ${labelError ? "input-invalid" : ""}`}
            value={page.label}
            onChange={(e) => onLabelChange(e.target.value)}
            placeholder="Home"
          />
          {labelError && <p className="text-xs text-warn">{labelError}</p>}
        </div>
        <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <label htmlFor={`page-${index}-path`} className="text-xs font-medium tracking-wide text-muted uppercase">
            Path
          </label>
          <input
            id={`page-${index}-path`}
            className="input font-mono text-sm"
            value={page.path}
            onChange={(e) => onPathChange(e.target.value)}
            placeholder="products/gummies (empty = home)"
            spellCheck={false}
          />
        </div>
        <button type="button" className="btn btn-secondary mt-6 shrink-0 text-sm" onClick={onRemove}>
          Remove page
        </button>
      </div>

      {suite === "datalayer" && (
        <div className="flex flex-col gap-4 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-4">
            <h4 className="text-sm font-medium text-ink">Interactions</h4>
            <button type="button" className="btn btn-secondary text-xs" onClick={onAddInteraction}>
              + Add interaction
            </button>
          </div>
          {page.interactions.length === 0 ? (
            <p className="text-xs text-faint">No interactions on this page.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {page.interactions.map((interaction) => (
                <InteractionRow
                  key={interaction.key}
                  interaction={interaction}
                  error={interactionErrors[interaction.key] ?? null}
                  onChange={(updater) => onInteractionChange(interaction.key, updater)}
                  onRemove={() => onRemoveInteraction(interaction.key)}
                />
              ))}
            </div>
          )}
          <div className="flex flex-col gap-1.5 sm:max-w-md">
            <label htmlFor={`page-${index}-skip-events`} className="text-xs font-medium tracking-wide text-muted uppercase">
              Skip events
            </label>
            <input
              id={`page-${index}-skip-events`}
              className="input font-mono text-sm"
              value={page.skipEventsText}
              onChange={(e) => onSkipEventsChange(e.target.value)}
              placeholder="generic, video_start"
              spellCheck={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function InteractionRow({
  interaction,
  error,
  onChange,
  onRemove,
}: {
  interaction: DraftInteraction;
  error: string | null;
  onChange: (updater: (i: DraftInteraction) => DraftInteraction) => void;
  onRemove: () => void;
}) {
  const fields = fieldsFor(interaction.type);
  return (
    <div className="grid grid-cols-1 gap-2 rounded-md border border-border bg-surface p-3 sm:grid-cols-[140px_1fr_auto] sm:items-start">
      <select
        className="input text-sm"
        value={interaction.type}
        onChange={(e) => onChange((i) => ({ ...i, type: e.target.value as InteractionType }))}
      >
        {INTERACTION_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <div className="flex flex-col gap-2">
        {fields.selector && (
          <input
            className="input font-mono text-xs"
            value={interaction.selector}
            onChange={(e) => onChange((i) => ({ ...i, selector: e.target.value }))}
            placeholder="CSS selector"
            spellCheck={false}
          />
        )}
        {fields.value && (
          <input
            className="input text-sm"
            value={interaction.value}
            onChange={(e) => onChange((i) => ({ ...i, value: e.target.value }))}
            placeholder={interaction.type === "fill" ? "Value" : "Value (optional)"}
          />
        )}
        {fields.ms && (
          <input
            className="input text-sm"
            value={interaction.ms}
            onChange={(e) => onChange((i) => ({ ...i, ms: e.target.value }))}
            placeholder="Milliseconds"
            inputMode="numeric"
          />
        )}
        {fields.percent && (
          <input
            className="input text-sm"
            value={interaction.percent}
            onChange={(e) => onChange((i) => ({ ...i, percent: e.target.value }))}
            placeholder="Percent (0-100)"
            inputMode="numeric"
          />
        )}
        {error && <p className="text-xs text-warn">{error}</p>}
      </div>
      <button type="button" className="btn btn-secondary text-xs" onClick={onRemove}>
        Remove
      </button>
    </div>
  );
}
