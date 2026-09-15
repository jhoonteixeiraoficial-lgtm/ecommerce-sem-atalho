# Assertive Autonomous Listings V2 Design

> **Date:** 2026-09-09
> **Status:** Approved for implementation
> **Supersedes:** Safety-sensitive parts of `2026-09-06-assertive-design.md`

## Goal

Turn a seller photo, description, or Mercado Livre URL into a publishable, conversion-oriented listing with an accurate title, an original description, a category-valid technical sheet, and AI-improved product photos. The seller should only answer facts that the official Mercado Livre contract requires and that trustworthy evidence cannot establish.

## Scope

- Support physical-product categories accepted by the official Mercado Livre `POST /items` and User Products flows.
- Resolve category behavior from live Mercado Livre category metadata, attributes, sale terms, account capabilities, validation responses, and variation rules.
- Handle classic listings, User Products, single-SKU products, and category-required variation attributes through one normalized category context.
- Detect specialized flows that require additional official resources, such as compatibility, size charts, regulated attributes, or variations, and collect only their blocking values.
- Improve seller-owned or seller-authorized photos with AI while retaining the original product's identity and variant.
- Keep the existing validated publisher, payload hash, lock, reconciliation, and immutable `published_payload` behavior intact.

`All categories` does not mean bypassing category policy. A category that Mercado Livre marks as disabled, restricted for the account, or dependent on an unsupported external authorization must return the exact official blocker instead of publishing fabricated data.

## Non-Goals

- Copying competitor descriptions, titles, or images.
- Treating competitor listing values as facts about the seller's product.
- Inventing missing measurements, GTIN, compatibility, warranty, certifications, package contents, or variation values.
- Generating unseen product angles or accessories.
- Claiming an item is the best seller when the official highlights endpoint did not provide that evidence.
- Replacing the stable publication/reconciliation checkpoint with a new publisher.

## User Experience

The primary creation screen has three entry modes:

1. Photos: one to eight seller-owned photos plus optional context.
2. Description: free text describing the exact product.
3. Link: the seller's own listing or a reference URL, with source rights and identity distinguished explicitly.

GTIN and brand/model remain supported as advanced identification hints, not primary tabs.

After input, the system performs identification, category resolution, market research, technical-sheet autofill, copy generation, image processing, and Mercado Livre preflight automatically. If publication blockers remain, it asks at most three concise questions at a time, ordered by the number of blockers each answer resolves. Recommended and optional attributes never interrupt the flow.

The result screen shows the final title, description, price, technical sheet, image gallery, evidence warnings, and one publish action. Editing remains optional.

## Architecture

### 1. Evidence Ledger

Every product fact keeps its value, status, source type, literal evidence, source URL or asset ID, retrieval time, and exact-identity scope. Generation consumes a frozen factual snapshot; it never consumes raw competitor values as product facts.

Publishable statuses are:

- `USER_OVERRIDE`: explicitly supplied by the seller.
- `CONFIRMED`: literal evidence from the seller input or an authoritative source tied to the exact identity.
- `AUTO_FILLED`: deterministic derivation or corroborated authoritative data tied to the exact identity.

Non-publishable statuses are:

- `NEEDS_CONFIRMATION`: plausible inference without adequate evidence.
- `CONFLICT`: trustworthy sources disagree.
- `UNKNOWN`: applicable but unavailable.
- `NOT_APPLICABLE`: proven irrelevant to this product/category.

AI confidence alone cannot promote a fact to a publishable status. A valid checksum proves a GTIN is syntactically valid, not that it belongs to the product.

The status and provenance must survive identification, generation, enrichment, seller answers, validation, payload building, and persistence without being recreated from the broad `source` field.

### 2. Dynamic Category Contract

A `CategoryContext` is loaded from official Mercado Livre resources for every listing and includes:

- category settings and publication eligibility;
- item attributes and their value contracts;
- variation attributes and combinations;
- sale terms;
- title and image limits;
- account/User Products capabilities;
- specialized requirements reported by preflight validation.

Category resolution uses this precedence:

1. Exact source item/category supplied by the seller.
2. Exact catalog product identity.
3. Mercado Livre domain/category prediction candidates.
4. Category sanity validation against product identity and official schema.

The schema marks blockers only from explicit official requirements or validation errors. Relevance, completeness, recommended tags, photo-count recommendations, and Assertive score remain advisory.

Category metadata is cached by category ID and contract version. User/account-specific responses are never shared across token scopes.

### 3. Minimal Questions

After autofill and preflight, unresolved requirements are grouped by normalized fact. Questions are ranked by:

1. Official publication blocker.
2. Number of validation issues resolved.
3. Closed-list answer availability.
4. Seller-only information such as package dimensions.

The API returns at most three questions per round. An answer is normalized against the current official schema, stored as `USER_OVERRIDE`, invalidates the old preflight hash, and triggers automatic revalidation. Optional and recommended fields can appear as non-blocking suggestions in the editor but are never asked before preview.

### 4. Competitive Intelligence

Competitor discovery builds an auditable `BenchmarkSet` from official signals:

- best-seller highlight position when available;
- catalog search relevance;
- exact-product match confidence;
- seller reputation and historical transaction count;
- Full/free-shipping signals;
- listing completeness and photo coverage.

`competitive_reference_strength` remains an Assertive heuristic and is labeled as such. Exact-product matching and competitive strength stay independent. Only exact, evidence-qualified catalog sources may enrich facts. Comparable products contribute structure, keyword, logistics, and coverage patterns only.

### 5. Title And Description

Text generation is a candidate generator followed by deterministic factual guards.

The title/family-name guard must:

- retain protected product type, brand, model, variant, and confirmed measurements;
- reject spelling mutations of protected identity tokens, including near substitutions such as `caneta` to `canela`;
- reject unsupported numbers, promotional claims, stock, shipping, or condition text;
- obey the category-specific title limit;
- account for fields Mercado Livre appends in User Products mode.

The description is original plain text and contains only claims present in the frozen factual snapshot. A claim verifier rejects unsupported numbers, warranty, certification, compatibility, package-content, performance, health, or superlative claims. Rejected output falls back to a deterministic factual description rather than blocking the listing.

### 6. Image Assets And AI Processing

Images are assets, not arbitrary mutable URLs. Every asset records owner, origin, rights status, storage key, SHA-256, MIME, dimensions, original parent, operation, provider/model, and fidelity decision.

Asset kinds are:

- `ORIGINAL_EVIDENCE`: immutable seller upload.
- `SOURCE_REFERENCE`: authorized source-item image.
- `DERIVED`: normalized or AI-improved image.
- `GENERATED_SCENE`: secondary scene containing the same product.
- `PUBLICATION_RENDITION`: public, normalized output sent to Mercado Livre.

Original evidence is private. Publication renditions are public because Mercado Livre must fetch them.

All vision tasks send actual image bytes or data URIs. The system batches all accepted images explicitly and never silently drops images above a model limit.

The first image pass performs deterministic normalization: decode, EXIF orientation, metadata stripping for public renditions, safe size limits, square canvas, and output compression. AI editing then may improve background, lighting, clarity, crop, and create a secondary context scene.

The AI prompt forbids changing product geometry, color, texture, labels, logos, ports, controls, package count, damage, variant, and included accessories. It must not create unseen product angles.

Every AI output is compared multimodally with the original evidence. The fidelity gate returns `ACCEPT`, `REVIEW`, or `REJECT` with stable reason codes. Only `ACCEPT` assets enter the automatic gallery. `REVIEW` and `REJECT` fall back to the original normalized rendition, so image-generation failure never prevents an otherwise valid publication.

Competitor photos remain reference-only and can never enter the publishable gallery.

The first production provider is Gemini through `GEMINI_API_KEY`, with the image model selected by `GEMINI_IMAGE_MODEL` and a catalog-verified default. Provider/model details are persisted for audit. The provider boundary allows later A/B evaluation without changing the pipeline.

### 7. Security

- Reject arbitrary internal/private image URLs and revalidate every redirect to prevent SSRF.
- Stream remote image downloads with byte, time, MIME, dimension, and pixel limits.
- Validate magic bytes by decoding rather than trusting browser MIME.
- Keep API keys server-side and never log image base64, signed URLs, or secrets.
- Require asset ownership and acceptable rights state before attaching an image to a listing.
- Include image content hashes in the validated revision so changed remote content invalidates preflight.

### 8. Resilience And Rollout

AI image processing is an idempotent operation with explicit attempt state, timeout, cost, provider, and error code. Failures preserve originals and continue with safe renditions.

Rollout is controlled independently:

- `ASSERTIVE_EVIDENCE_V2_ENABLED`
- `ASSERTIVE_COPY_GUARD_V2_ENABLED`
- `ASSERTIVE_IMAGE_ENHANCEMENT_ENABLED`

The stable publisher remains the final authority. Feature flags can disable new generation stages without changing already validated listings.

### 9. Observability

Stage events record IDs and metadata, never raw secrets or image bytes. Required events include:

- factual candidate accepted/rejected and reason;
- category resolution source and confidence;
- official schema version/cache status;
- blocker count before and after autofill;
- benchmark source and ranking evidence;
- title/description guard rejection reasons;
- image ingestion, normalization, edit, fidelity result, fallback, latency, and cost;
- requested versus actually sent image count;
- publication rendition hash and post-publication image reconciliation.

## Acceptance Criteria

- A required `NEEDS_CONFIRMATION`, `CONFLICT`, or `UNKNOWN` value cannot satisfy readiness or reach `POST /items`.
- A seller answer becomes `USER_OVERRIDE`, invalidates preflight, and is revalidated.
- Category behavior comes from the official schema/validator and works across representative electronics, tools, fashion, home, auto-parts, beauty, grocery, and sports fixtures.
- Disabled or specialized categories return official actionable blockers rather than fabricated values.
- `Caneta de Polaridade` cannot be published as `Canela de Polaridade` when the protected identity says `Caneta`.
- Generated title and description contain no unsupported measurable or regulated claim.
- Photo classification and fidelity requests contain actual image parts.
- Every accepted AI image has immutable original lineage and an `ACCEPT` fidelity assessment.
- Rejected/failed AI edits fall back to the normalized original.
- Competitor images never enter the publishable gallery.
- Existing publication payload hash, lock, reconciliation, and immutable `published_payload` regressions continue to pass.
- Full tests, typecheck, production build, and representative ML preflight fixtures pass before rollout.
