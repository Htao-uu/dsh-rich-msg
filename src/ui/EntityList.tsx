import React from "react";
import { Check, ChevronRight, ExternalLink } from "lucide-react";
import type { Entity, RichNode } from "../core/schema";
import { Picture } from "./Picture";

/**
 * Row thumbnail shape. Compact rows keep the poster default so old documents
 * are stable; a feature row exists to show the thing itself, so its default is
 * the wide frame a screenshot needs. An explicit thumbShape always wins.
 */
function shapeOf(entity: Entity, layout: "compact" | "feature"): string {
  return entity.thumbShape ?? (layout === "feature" ? "landscape" : "poster");
}

function thumbClass(entity: Entity, layout: "compact" | "feature"): string {
  return `ru-poster-thumb ru-poster-${shapeOf(entity, layout)}`;
}

function Badge({ entity }: { entity: Entity }) {
  if (!entity.badge) return null;
  return (
    <span
      className="ru-entity-badge"
      data-tone={entity.badge.tone ?? "success"}
    >
      <Check size={13} aria-hidden="true" />
      {entity.badge.label}
    </span>
  );
}

function Sources({ entity }: { entity: Entity }) {
  if (!entity.sources?.length) return null;
  return (
    <span className="ru-entity-sources">
      {entity.sources.map((source) => (
        <a
          key={source.url}
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={13} aria-hidden="true" />
          {source.title}
        </a>
      ))}
    </span>
  );
}

/**
 * Full-width entity rows. `compact` keeps the original reference layout: one
 * button per row, poster thumbnail, two-line description. `feature` trades that
 * density for a wide preview, the whole description and visible sources, so a
 * software shortlist can be judged without opening every panel.
 */
export function EntityList({
  node,
  entities: pool,
  onOpen,
}: {
  node: Extract<RichNode, { type: "entity-list" }>;
  entities: Entity[];
  onOpen: (id: string) => void;
}) {
  const entities = node.entityIds
    .map((id) => pool.find((entry) => entry.id === id))
    .filter((entry): entry is Entity => Boolean(entry));
  if (entities.length === 0) return null;
  const layout = node.layout === "feature" ? "feature" : "compact";
  if (layout === "feature")
    return (
      <ul className="ru-entity-rows" data-layout="feature">
        {entities.map((entity) => (
          <li
            key={entity.id}
            className="ru-entity-feature"
            data-shape={shapeOf(entity, "feature")}
            data-media={entity.image ? "image" : "none"}
          >
            {entity.image && (
              <button
                type="button"
                className={`ru-feature-media ru-feature-media-${
                  entity.thumbShape ?? "poster"
                }`}
                onClick={() => onOpen(entity.id)}
                aria-label={`Details: ${entity.title}`}
              >
                <Picture
                  src={entity.image}
                  alt=""
                  className={thumbClass(entity, "feature")}
                />
              </button>
            )}
            <div className="ru-feature-body">
              <span className="ru-eyebrow">{entity.kind}</span>
              <h3 className="ru-feature-title">
                <button type="button" onClick={() => onOpen(entity.id)}>
                  {entity.title}
                </button>
              </h3>
              {entity.subtitle && (
                <p className="ru-feature-subtitle">{entity.subtitle}</p>
              )}
              {entity.description && (
                <p className="ru-feature-description">{entity.description}</p>
              )}
              {entity.badge && <Badge entity={entity} />}
              <Sources entity={entity} />
            </div>
          </li>
        ))}
      </ul>
    );
  return (
    <ul className="ru-entity-rows" data-layout="compact">
      {entities.map((entity) => (
        <li key={entity.id}>
          <button
            type="button"
            className="ru-entity-row"
            onClick={() => onOpen(entity.id)}
            aria-label={`Details: ${entity.title}`}
          >
            {entity.image && (
              <Picture
                src={entity.image}
                alt=""
                className={thumbClass(entity, "compact")}
              />
            )}
            <span className="ru-entity-row-meta">
              <span className="ru-eyebrow">{entity.kind}</span>
              <strong>{entity.title}</strong>
              {entity.subtitle && <span>{entity.subtitle}</span>}
              {entity.description && (
                <span className="ru-entity-row-description">
                  {entity.description}
                </span>
              )}
              {entity.badge && <Badge entity={entity} />}
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
