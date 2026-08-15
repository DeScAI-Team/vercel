import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ReviewVisual from "@/components/ReviewVisual";
import { isPumpScienceReview } from "@/api/pubchem";
import {
  getCachedReviewVisualForTxid,
  getCachedReviewVisualsForTxids,
  resolveReviewVisual,
  type ReviewVisualResult
} from "@/api/resolveReviewVisual";
import { fetchReviewFromArweave } from "@/api/reviews";
import { DEFAULT_REVIEW_AUTHOR, type Review } from "@/types/review";

type RatingRow = { label: string; value: number };
type FeaturedPanelProps = {
  featuredTxids: string[];
  sourceLoading?: boolean;
  sourceError?: string | null;
};

const CAROUSEL_INTERVAL_MS = 8000;
const ratingColors = ["#ff4444", "#b546ff", "#ff6b2d", "#3b8cff", "#52ff92"];

const clamp5: React.CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 5,
  WebkitBoxOrient: "vertical",
  overflow: "hidden"
};

const normalizeScore = (value?: number | null) =>
  typeof value === "number" && !Number.isNaN(value) ? Math.round(value <= 1 ? value * 100 : value) : null;

const averageScore = (review?: Review | null) => {
  if (!review) return null;
  if (typeof review.average_score === "number") {
    return normalizeScore(review.average_score);
  }

  const scores = (review.categories ?? [])
    .map((category) => normalizeScore(category.score))
    .filter((score): score is number => typeof score === "number");

  if (!scores.length) return null;
  return Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
};

const getNarrative = (review?: Review | null) => {
  const candidates = [
    review?.review_statement,
    ...(review?.categories ?? []).flatMap((category) => [
      category.section?.review_statement,
      category.section?.rationale,
      category.section?.summary,
      category.section?.text
    ]),
    ...(review?.info ?? []).flatMap((section) => [section.content?.summary, section.content?.text])
  ].filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);

  const unique = [...new Set(candidates.map((entry) => entry.trim()))];
  return unique.slice(0, 3).join(" ") || null;
};

const countSections = (review?: Review | null) => {
  if (!review) return null;
  return (review.categories?.length ?? 0) + (review.info?.length ?? 0);
};

const formatDate = (dateString?: string | null) => {
  if (!dateString) return "Unknown";
  const date = new Date(dateString);
  return Number.isNaN(date.getTime())
    ? dateString
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

const isSingleLineCategoryLabel = (label: string) => label.trim().toLowerCase() === "tokenomics governance";

const buildRatings = (review: Review): RatingRow[] =>
  (review.categories ?? [])
    .map((category) => ({ label: category.label, value: normalizeScore(category.score) }))
    .filter((row): row is RatingRow => row.value !== null)
    .slice(0, 5);

type MetaStatIconType = "published" | "score" | "sections";

const ReviewMetaTag = ({ children }: { children: string }) => (
  <span className="inline-flex items-center rounded-[4px] border border-[#3d5694]/55 bg-[#0a1428]/90 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-[#9eb6ef] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
    {children}
  </span>
);

const MetaStatIcon = ({ type }: { type: MetaStatIconType }) => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2" aria-hidden="true">
    {type === "published" && (
      <>
        <path d="M12 5v8l4 2" />
        <circle cx="12" cy="12" r="8" />
      </>
    )}
    {type === "score" && <path d="m12 3 2.7 5.7 6.3.8-4.6 4.4 1.2 6.1L12 17l-5.6 3 1.2-6.1L3 9.5l6.3-.8L12 3Z" />}
    {type === "sections" && (
      <>
        <path d="M8 6h13" />
        <path d="M8 12h13" />
        <path d="M8 18h13" />
        <path d="M3 6h.01" />
        <path d="M3 12h.01" />
        <path d="M3 18h.01" />
      </>
    )}
  </svg>
);

const SkeletonCard = () => (
  <article className="space-y-6 rounded-[16px] border border-[#263f72] bg-[#1a2247] p-5 shadow-[inset_0_1px_0_rgba(80,126,205,0.12)] animate-pulse">
    <div className="h-8 w-3/4 rounded-lg bg-[#14214a]/72" />
    <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
      {[...Array(4)].map((_, idx) => (
        <div key={idx} className="space-y-2">
          <div className="h-3 w-16 rounded bg-[#14214a]/72" />
          <div className="h-4 w-20 rounded bg-[#20315e]" />
        </div>
      ))}
    </div>
    <div className="h-4 w-24 rounded bg-[#14214a]/72" />
    <div className="h-16 rounded-2xl bg-[#14214a]/72" />
    <div className="grid grid-cols-5 gap-4 justify-items-center">
      {[...Array(5)].map((_, idx) => (
        <div key={idx} className="h-28 w-28 rounded-full bg-[#14214a]/72" />
      ))}
    </div>
  </article>
);

const FeaturedReviewCard = ({
  review,
  visual,
  imageFetchPriority = "auto"
}: {
  review: Review;
  visual?: ReviewVisualResult;
  imageFetchPriority?: "high" | "low" | "auto";
}) => {
  const ratings = useMemo(() => buildRatings(review), [review]);
  const hasRatings = ratings.length > 0;
  const overviewText = getNarrative(review);
  const average = averageScore(review);

  const meta: Array<{ label: string; value: string | number; icon: MetaStatIconType }> = [
    { label: "Published", value: formatDate(review.created_at), icon: "published" },
    { label: "Composite Score", value: average !== null ? `${average}%` : "Pending", icon: "score" },
    { label: "Sections", value: countSections(review) ?? "—", icon: "sections" }
  ];

  return (
    <article className="relative overflow-hidden rounded-[20px] border border-[#385083] bg-[linear-gradient(135deg,rgba(28,43,92,0.82),rgba(8,14,38,0.92)_42%,rgba(33,17,88,0.72))] p-5 shadow-[inset_0_0_48px_rgba(121,86,255,0.08),0_16px_46px_rgba(0,0,0,0.45)]">
      <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-[#7e47ff]/16 blur-[90px]" aria-hidden="true" />

      <div className="relative grid gap-5 md:grid-cols-[220px_minmax(0,1fr)] md:items-center">
        <ReviewVisual
          imageUrl={visual?.url ?? null}
          visualMode={visual?.mode ?? (isPumpScienceReview(review) ? "structure" : "cover")}
          badge="featured"
          expectImage={!visual?.url}
          fetchPriority={imageFetchPriority}
        />

        <header className="min-w-0 space-y-3 md:self-center">
          <h3
            className="font-display text-2xl font-semibold leading-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.35)] md:text-[1.65rem]"
            style={clamp5}
          >
            {review.title || "Untitled Review"}
          </h3>
          <p className="text-xs uppercase tracking-[0.28em] text-white/48">
            Reviewed by{" "}
            <span className="font-semibold normal-case tracking-normal text-[#62a7ff]">
              {review.dao_name ?? DEFAULT_REVIEW_AUTHOR}
            </span>
          </p>
          {(review.platform || review.category) && (
            <div className="flex flex-wrap gap-2 pt-1">
              {review.platform ? <ReviewMetaTag>{`platform: ${review.platform}`}</ReviewMetaTag> : null}
              {review.category ? <ReviewMetaTag>{`category: ${review.category}`}</ReviewMetaTag> : null}
            </div>
          )}
          <p className="break-all font-mono text-[10px] uppercase tracking-[0.12em] text-white/40">
            TXID: {review.txid ?? review.id}
          </p>
        </header>
      </div>

      <dl className="relative mt-5 grid gap-0 overflow-hidden rounded-[16px] border border-[#263d70] bg-[#14214a]/72 text-sm shadow-[inset_0_1px_0_rgba(80,126,205,0.12)] sm:grid-cols-3">
        {meta.map(({ label, value, icon }) => (
          <div
            key={label}
            className="flex min-w-0 items-center gap-3 border-b border-[#2f4271] px-4 py-3.5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#5fa9ff]/40 text-[#65a7ff]">
              <MetaStatIcon type={icon} />
            </span>
            <div className="min-w-0">
              <dt className="text-sm text-white/56">{label}</dt>
              <dd className="font-semibold leading-snug">{value}</dd>
            </div>
          </div>
        ))}
      </dl>

      <section className="relative mt-5 space-y-3 text-sm leading-relaxed text-white/80">
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="text-base font-semibold uppercase tracking-[0.3em] text-[#a26bff]">Overview</h4>
        </div>
        <p className="text-base leading-relaxed text-white/72" style={clamp5}>
          {overviewText || "No summary available yet."}
        </p>
        <Link
          to={`/review/${review.id}`}
          className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-[#9fc3ff] underline-offset-4 transition hover:text-white hover:underline"
        >
          Read the full review
          <span aria-hidden className="text-white/60">→</span>
        </Link>
      </section>

      {hasRatings && (
        <div className="relative mt-6 border-t border-[#263d70] pt-6">
          <div className="flex flex-wrap justify-center gap-x-10 gap-y-5">
            {ratings.map(({ label, value }, index) => {
              const arcColor = ratingColors[index % ratingColors.length] ?? "#59b8ff";
              const angle = value * 3.6;
              return (
                <div
                  key={label}
                  className="flex flex-col items-center gap-3 text-xs font-semibold uppercase tracking-wide text-white/58"
                >
                  <span
                    className={`text-center text-white/70 ${isSingleLineCategoryLabel(label) ? "md:whitespace-nowrap" : ""}`}
                  >
                    {label.toUpperCase()}
                  </span>
                  <div
                    className="relative h-28 w-28 rounded-full shadow-[0_0_22px_rgba(87,136,255,0.1)]"
                    style={{
                      background:
                        `radial-gradient(circle at center, #101936 63%, transparent 64%), ` +
                        `conic-gradient(${arcColor} ${angle}deg, rgba(80,126,205,0.18) 0)`
                    }}
                  >
                    <div className="absolute inset-[14px] flex flex-col items-center justify-center rounded-full bg-[#111936] text-[1.15rem] font-semibold text-white">
                      {value}
                      <span className="text-[0.65rem] font-normal text-white/60">%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </article>
  );
};

const FeaturedPanel = ({ featuredTxids, sourceLoading = false, sourceError = null }: FeaturedPanelProps) => {
  const [detailedReviews, setDetailedReviews] = useState<Review[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [reviewVisuals, setReviewVisuals] = useState<Record<string, ReviewVisualResult>>(() =>
    getCachedReviewVisualsForTxids(featuredTxids)
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number | undefined>(undefined);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);

  const updateViewportHeight = useCallback(() => {
    const slide = slideRefs.current[activeIndex];
    if (slide) {
      setViewportHeight(slide.getBoundingClientRect().height);
    }
  }, [activeIndex]);

  useEffect(() => {
    updateViewportHeight();
  }, [updateViewportHeight, detailedReviews]);

  useEffect(() => {
    const slide = slideRefs.current[activeIndex];
    if (!slide) return;

    const observer = new ResizeObserver(() => updateViewportHeight());
    observer.observe(slide);
    return () => observer.disconnect();
  }, [activeIndex, updateViewportHeight, detailedReviews]);

  useEffect(() => {
    if (!featuredTxids.length) {
      setDetailedReviews([]);
      setReviewVisuals({});
      setDetailLoading(false);
      setDetailError(null);
      setActiveIndex(0);
      return;
    }

    setReviewVisuals((current) => ({ ...getCachedReviewVisualsForTxids(featuredTxids), ...current }));

    let cancelled = false;

    const load = async () => {
      setDetailLoading(true);
      setDetailError(null);
      setActiveIndex(0);

      try {
        const settled = await Promise.allSettled(featuredTxids.map((txid) => fetchReviewFromArweave(txid)));

        const reviews = settled
          .map((result, index) => {
            if (result.status === "fulfilled") {
              return result.value;
            }
            console.error(`Failed to load featured review ${featuredTxids[index]}`, result.reason);
            return null;
          })
          .filter((review): review is Review => review !== null);

        if (!reviews.length) {
          throw new Error("Featured research could not be loaded from Arweave");
        }

        if (!cancelled) {
          setDetailedReviews(reviews);

          const visuals: Record<string, ReviewVisualResult> = {};
          for (const review of reviews) {
            if (cancelled) break;
            visuals[review.id] = await resolveReviewVisual(review);
          }

          if (!cancelled) {
            setReviewVisuals((current) => ({ ...current, ...visuals }));
          }
        }
      } catch (err) {
        if (!cancelled) setDetailError((err as Error).message || "Failed to load featured research");
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [featuredTxids]);

  useEffect(() => {
    const review = detailedReviews[activeIndex];
    if (!review) {
      return;
    }

    const cached = getCachedReviewVisualForTxid(review.id);
    if (cached?.url) {
      setReviewVisuals((current) => (current[review.id] ? current : { ...current, [review.id]: cached }));
      return;
    }

    let cancelled = false;
    void resolveReviewVisual(review).then((visual) => {
      if (!cancelled && visual.url) {
        setReviewVisuals((current) => ({ ...current, [review.id]: visual }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeIndex, detailedReviews]);

  const slideCount = detailedReviews.length;
  const hasMultipleSlides = slideCount > 1;

  const goToSlide = useCallback(
    (index: number) => {
      if (!slideCount) return;
      const normalized = ((index % slideCount) + slideCount) % slideCount;
      setActiveIndex(normalized);
    },
    [slideCount]
  );

  const goNext = useCallback(() => goToSlide(activeIndex + 1), [activeIndex, goToSlide]);
  const goPrev = useCallback(() => goToSlide(activeIndex - 1), [activeIndex, goToSlide]);

  useEffect(() => {
    if (!hasMultipleSlides || isPaused) return;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slideCount);
    }, CAROUSEL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [hasMultipleSlides, isPaused, slideCount]);

  const loading = sourceLoading || detailLoading;
  const error = sourceError ?? detailError;

  return (
    <section className="rounded-[24px] border border-[#243c68] bg-[linear-gradient(145deg,rgba(30,44,90,0.88),rgba(6,11,27,0.96)_45%,rgba(18,16,59,0.9))] p-[1px] shadow-[0_20px_70px_rgba(1,4,18,0.78),0_0_36px_rgba(87,115,255,0.14)]">
      <div className="relative overflow-hidden rounded-[23px] border border-[#263f72] bg-[#071025]/92 px-4 pb-4 pt-4 text-white shadow-[inset_0_1px_0_rgba(80,126,205,0.12)]">
        <div className="absolute inset-0 -z-10 opacity-50">
          <div className="neon-blur left-1/3 top-6 translate-x-1/2 bg-[#2b5176]" />
          <div className="neon-blur left-1/4 top-1/2 bg-[#59b8ff]" />
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-4">
          <h2 className="flex-1 text-center">
            <span className="featured-chip inline-flex">Featured Reviews</span>
          </h2>
          {loading && (
            <span className="ml-auto whitespace-nowrap text-xs uppercase tracking-[0.3em] text-white/60">
              Updating…
            </span>
          )}
        </div>

        {error && (
          <p className="mb-4 rounded-full border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-100">
            {error} — showing placeholders until data loads.
          </p>
        )}

        {loading && <SkeletonCard />}

        {!loading && !detailedReviews.length && (
          <article className="space-y-4 rounded-[16px] border border-[#263f72] bg-[#1a2247] p-5 text-white/80 shadow-[inset_0_1px_0_rgba(80,126,205,0.12)]">
            <h3 className="text-2xl font-semibold">No featured review yet</h3>
            <p className="text-white/70">No agent uploads with a composite score were found.</p>
          </article>
        )}

        {!loading && detailedReviews.length > 0 && (
          <div
            className="relative"
            role="region"
            aria-roledescription="carousel"
            aria-label="Top featured reviews"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            onFocusCapture={() => setIsPaused(true)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setIsPaused(false);
              }
            }}
          >
            <div
              className="overflow-hidden transition-[height] duration-500 ease-in-out"
              style={viewportHeight !== undefined ? { height: viewportHeight } : undefined}
            >
              <div
                className="flex items-start transition-transform duration-500 ease-in-out"
                style={{ transform: `translateX(-${activeIndex * 100}%)` }}
              >
                {detailedReviews.map((review, index) => (
                  <div
                    key={review.id}
                    ref={(node) => {
                      slideRefs.current[index] = node;
                    }}
                    className="w-full shrink-0"
                    aria-hidden={index !== activeIndex}
                  >
                    <FeaturedReviewCard
                      review={review}
                      visual={reviewVisuals[review.id]}
                      imageFetchPriority={index === activeIndex ? "high" : "low"}
                    />
                  </div>
                ))}
              </div>
            </div>

            {hasMultipleSlides && (
              <div className="mt-4 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={goPrev}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#4867af]/60 bg-[#0a1530]/88 text-white/80 shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition hover:border-[#7aa7ff]/70 hover:bg-[#14214a] hover:text-white"
                  aria-label="Previous featured review"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>

                <div className="flex items-center justify-center gap-2">
                  {detailedReviews.map((review, index) => {
                    const isActive = index === activeIndex;
                    return (
                      <button
                        key={review.id}
                        type="button"
                        onClick={() => goToSlide(index)}
                        className={`h-2.5 rounded-full transition-all ${
                          isActive ? "w-8 bg-[#9fc3ff]" : "w-2.5 bg-white/25 hover:bg-white/45"
                        }`}
                        aria-label={`Go to featured review ${index + 1}: ${review.title || "Untitled Review"}`}
                        aria-current={isActive ? "true" : undefined}
                      />
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={goNext}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#4867af]/60 bg-[#0a1530]/88 text-white/80 shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition hover:border-[#7aa7ff]/70 hover:bg-[#14214a] hover:text-white"
                  aria-label="Next featured review"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default FeaturedPanel;
