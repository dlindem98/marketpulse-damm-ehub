/**
 * Shared Plotly component factory.
 *
 * Why this file exists: `react-plotly.js` is a thin React wrapper around
 * `plotly.js`. When `react-plotly.js` is consumed via ESM (Vite),
 * the default-export unwrapping is unreliable — some builds expose it as
 * `{ default: { default: Component } }` and you end up rendering `{object}`,
 * which crashes with "Element type is invalid".
 *
 * Plotly's own escape hatch for this is `createPlotlyComponent(plotly)`
 * from `react-plotly.js/factory`. We do it once here and share the
 * component across all chart components (Sankey, Forecast curve, SHAP
 * waterfall, Simulator comparison).
 */

// @ts-ignore — no types for the factory subpath
import createPlotlyComponent from "react-plotly.js/factory"
// @ts-ignore — plotly.js-dist-min has no .d.ts
import Plotly from "plotly.js-dist-min"

const Plot = createPlotlyComponent(Plotly as any)
export default Plot as any
