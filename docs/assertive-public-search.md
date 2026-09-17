# Public search collection — operational boundaries

## Current implementation

`researchMarket` reads `loadPublicSearch`. The shared cache accepts only same-query, validated snapshots observed within six hours. A miss can invoke `collectPublicSearch`, but collection defaults OFF: it requires SCRAPINGBEE_API_KEY and an explicit ASSERTIVE_SEARCH_DAILY_CREDITS integer between 25 and 250. Do not expose these variables to browsers.

Before every provider request, server-only RPC `reserve_assertive_search_credits` reserves 25 credits. It serializes reservation transactions globally, uses a UTC daily budget, and prevents the same query from being retried for six hours. Missing RPC, denied budget, or reservation errors prevent external calls. Reserved credits are deliberately not refunded on failures; they are conservative allowances, not actual provider charges. No automatic retries or stealth escalation.

Migration: `20260917111500_assertive_search_budget.sql`. Both tables use RLS; only service_role has read access and can execute the SECURITY DEFINER reservation function. Applied and verified remotely. Database tests use rollback; their positive first-reservation assertion assumes today's budget has no previous reservations. Run them in an isolated database after enabling real collection.

## Provider and evidence

Use explicit premium_proxy=true, render_js=true, stealth_proxy=false, country_code=br, block_resources=false, block_ads=false. Current documentation prices this tier at 25 credits. This is NOT a provider-enforced max_cost cap: max_cost is restricted to auto-mode. Review pricing before enabling production. Auto-mode returned HTTP200 at 10 credits without usable search results during the live integration test; never treat HTTP success as evidence success. The explicit configuration previously produced a captured page with 56 cards; the updated integrated collector has not yet passed a fresh live success test.

Structured logs expose outcome, HTTP status, and numeric spb-cost only. Never log URLs containing api_key, response bodies, cookies or authorization tokens.

Observed search position is not proof of sales leadership. Join ranking to exact item_id, not merely catalog_product_id. Seller-page parsing requires rendered listing ID and matching seller sections. Keep store sales, catalog sales and listing sales separate. The seller parser is tested on real VIABRASIL and CENTERPAPER pages but is not yet automatically wired into candidate enrichment/selection.

## Remaining acceptance criteria

- Fresh successful live collector request followed by verified persistent cache reuse.
- End-to-end automated seller enrichment and exact-product candidate selection, including non-catalog listings.
- Browser demonstration through the actual Assertive analysis flow.
- Deliberate production budget/configuration and deployment; neither is enabled by these code changes.

Free-trial credits are not a permanent free service. No paid subscription was created for this work.
