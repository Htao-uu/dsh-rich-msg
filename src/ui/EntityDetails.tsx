import React, { useEffect, useId, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import type { Entity } from "../core/schema";
import { formatNumber } from "./blocks/Metrics";
import { InlineGallery, normalizeGalleryImages } from "./Gallery";
import { Picture } from "./Picture";

export interface EntityDetailsProps {
  entity: Entity;
  entities: Entity[];
  onSelect: (id: string) => void;
  titleId?: string;
  titleRef?: React.Ref<HTMLHeadingElement>;
}

/**
 * The body of an entity detail surface, shared by the in-page drawer and the
 * native right-sidebar tab. Chrome, focus handling and portals stay with the
 * host shell, so both surfaces show the same facts, gallery and sources.
 */
export function EntityDetails({
  entity,
  entities,
  onSelect,
  titleId,
  titleRef,
}: EntityDetailsProps) {
  const [rawPage, setPage] = useState(0);
  const fallbackId = useId();
  const id = titleId ?? fallbackId;
  useEffect(() => setPage(0), [entity.id]);
  const sourceKey = normalizeGalleryImages(
    entity.images?.length ? entity.images : entity.image ? [entity.image] : [],
    entity.title,
  )
    .map((frame) => frame.src)
    .join("\n");
  // A streaming document can replace an entity's photos under the same id.
  useEffect(() => setPage(0), [sourceKey]);
  const images = normalizeGalleryImages(
    entity.images?.length ? entity.images : entity.image ? [entity.image] : [],
    entity.title,
  );
  // The observed reference shows two portrait photos side by side, with dots
  // for further pages. `single` opts into one captioned frame at a time, which
  // is what an application screenshot needs: a paired half-width shot is not
  // readable and its caption has nowhere to go.
  const single = entity.galleryLayout === "single";
  const perPage = single ? 1 : images.length > 1 ? 2 : 1;
  const pages = Math.ceil(images.length / perPage);
  const page = Math.min(rawPage, Math.max(0, pages - 1));
  const first = page * perPage;
  const visible = images.slice(first, first + perPage);
  const related = (entity.related ?? [])
    .map((entry) => entities.find((candidate) => candidate.id === entry))
    .filter((entry): entry is Entity => Boolean(entry));
  return (
    <>
      {single && images.length > 0 && (
        <InlineGallery images={images} label={entity.title} />
      )}
      {!single && images.length > 0 && (
        <div
          className={`ru-detail-gallery${
            visible.length > 1 ? " ru-detail-gallery-pair" : ""
          }`}
        >
          <div className="ru-detail-page">
            {visible.map((frame, index) => (
              <figure
                className="ru-detail-figure"
                key={`${first + index}:${frame.src}`}
              >
                <Picture
                  src={frame.src}
                  alt={frame.alt}
                  className="ru-detail-photo"
                />
                {frame.caption && <figcaption>{frame.caption}</figcaption>}
              </figure>
            ))}
          </div>
          {pages > 1 && pages <= 5 && (
            <div className="ru-detail-dots">
              {Array.from({ length: pages }, (_, index) => (
                <button
                  key={index}
                  type="button"
                  aria-label={`Gallery page ${index + 1} of ${pages}`}
                  aria-pressed={page === index}
                  onClick={() => setPage(index)}
                />
              ))}
            </div>
          )}
          {pages > 5 && (
            <div className="ru-detail-pager">
              <button
                type="button"
                aria-label="Previous photos"
                disabled={page === 0}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
              >
                <ChevronLeft size={15} aria-hidden="true" />
              </button>
              <output aria-live="polite">
                {page + 1} / {pages}
              </output>
              <button
                type="button"
                aria-label="Next photos"
                disabled={page === pages - 1}
                onClick={() =>
                  setPage((current) => Math.min(pages - 1, current + 1))
                }
              >
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      )}
      <div className="ru-detail-body">
        <h2 id={id} ref={titleRef} tabIndex={-1}>
          {entity.title}
        </h2>
        {entity.subtitle && (
          <p className="ru-detail-subtitle">{entity.subtitle}</p>
        )}
        {entity.description && <p>{entity.description}</p>}
        {entity.badge && (
          <span
            className="ru-entity-badge ru-detail-badge"
            data-tone={entity.badge.tone ?? "success"}
          >
            <Check size={13} aria-hidden="true" />
            {entity.badge.label}
          </span>
        )}
        {entity.facts?.length ? (
          <dl className="ru-facts">
            {entity.facts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>
                  {typeof fact.value === "number"
                    ? formatNumber(fact.value)
                    : String(fact.value ?? "—")}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {entity.cast?.length ? (
          <section>
            <h3 className="ru-section-title">Cast</h3>
            <ul className="ru-cast">
              {entity.cast.map((member) => (
                <li key={`${member.name}-${member.role ?? ""}`}>
                  {member.image ? (
                    <Picture
                      src={member.image}
                      alt=""
                      className="ru-cast-photo"
                    />
                  ) : (
                    <span className="ru-cast-initial" aria-hidden="true">
                      {member.name.slice(0, 1)}
                    </span>
                  )}
                  <span className="ru-cast-copy">
                    <strong title={member.name}>{member.name}</strong>
                    {member.role && (
                      <small title={member.role}>{member.role}</small>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {entity.sources?.length ? (
          <section>
            <h3 className="ru-section-title">Sources</h3>
            {entity.sources.map((source) => (
              <a
                className="ru-source"
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                key={source.url}
              >
                <ExternalLink size={15} aria-hidden="true" />
                <span>
                  {source.title}
                  <small>{new URL(source.url).hostname}</small>
                </span>
                <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            ))}
          </section>
        ) : null}
        {related.length > 0 && (
          <section>
            <h3 className="ru-section-title">Related</h3>
            {related.map((entry) => (
              <button
                type="button"
                className="ru-related"
                key={entry.id}
                onClick={() => onSelect(entry.id)}
              >
                {entry.title}
                <ChevronRight size={16} />
              </button>
            ))}
          </section>
        )}
        {entity.sources?.length ? (
          <p className="ru-provenance">
            Details on this panel are linked to the sources above.
          </p>
        ) : null}
      </div>
    </>
  );
}
