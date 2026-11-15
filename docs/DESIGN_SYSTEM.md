# ASGARD visual direction

## Brand direction
Editorial luxury with a restrained 3D object. The experience is intentionally split into two moods:
- Welcome page: cinematic, editorial, spacious, charcoal / warm off-white / muted sage / aged brass.
- Trading workspace: dense enough for real use, restrained dark terminal, quiet borders, square corners, clear information hierarchy.

## Welcome experience
- ASGARD wordmark and navigation.
- Headline: “Clarity in every movement.”
- Product positioning around market intelligence, execution systems, risk and performance.
- CSS-built 3D metallic orb with orbital rings, subtle float motion and reduced-motion support.
- Enter the markets CTA opens the existing paper-trading workspace.

## Trading workspace
- Existing search/autocomplete, live quote polling, market watch, order ticket, C++ matching engine, order book depth, orders, trades and portfolio.
- Chart modes: line, candlestick and OHLC bars.
- Timeframes: 1m, 5m, 15m, 1h, 4h, 1d.
- Optional SMA 20 and EMA 9 overlays.
- No fake chart values are introduced by the visual redesign.

## Design principles
- Avoid generic glowing cards and excessive gradients.
- Typography: restrained sans-serif for controls, editorial serif for major headings.
- Muted sage and aged brass accents; preserve high contrast for financial values.
- Responsive layout and prefers-reduced-motion support.


## 3D implementation
The welcome hero uses a real Three.js WebGL scene, not a CSS circle pretending to be 3D:
- high-detail icosahedron with physically based metallic material
- inner dark metallic sphere
- three independently angled orbital rings and two metallic satellites
- ambient, directional and point lighting
- ACES tone mapping and capped device pixel ratio
- gentle idle rotation and pointer parallax
- responsive ResizeObserver sizing and WebGL resource cleanup
- CSS-only fallback decoration if WebGL cannot initialize
