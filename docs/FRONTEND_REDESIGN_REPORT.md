# LiveSpace homepage redesign

This homepage summary accompanies the [platform redesign and validation report](FRONTEND_PLATFORM_REDESIGN_REPORT.md), which records the implementation, exact test results, viewport and browser coverage, known limitations, and final readiness verdict.

Desktop uses the existing navigation, a two-column hero with a single linked café in an arched frame, compact search controls, a map-discovery strip, and up to four related cards. Mobile opens with a compact search row, a geographic settings dialog and advanced filters next to search, a swipeable featured café, a horizontal recommendations row, and the original five-item bottom navigation.

The browser uses the same recommendation logic on both layouts. Rotation takes approximately seven seconds and synchronizes the category, featured café, and related cards. Categories qualify from public catalogue tags, published menu evidence, active promotions, or usable seat measurements. Location settings filter by the verified district field. Unsupported numeric distances and ratings are omitted. Desktop uses clearly labelled sample photography. Mobile retains its labelled cartoon illustration.

The key implementation files are `app.js`, `js/features/home/discovery.js`, `js/features/home/recommendations.js`, and `styles/discovery.css`. The map, catalogue, café detail, favourites, and role routes use the existing APIs. Future backend support is documented separately in [Post-frontend backend recommendations](POST_FRONTEND_BACKEND_RECOMMENDATIONS.md).

An all-demo catalogue also shows clearly labelled sample menu, discount, and seating examples. The hero and related card images change with the active category. Catalogues containing real cafés use the existing eligibility rules.
