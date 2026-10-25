import type { AnyCircuitElement } from "circuit-json"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { Circuit } from "tscircuit"
import { DdrPlacementSolver } from "../lib"

export const ddrExamples = {
  intact: "Continuous ground plane",
  gap: "Split beneath the signal",
  floating: "Disconnected ground island",
  "missing-return": "Layer change without a ground bridge",
  "existing-return": "Layer change with an existing ground bridge",
} as const
export type DdrExample = keyof typeof ddrExamples

const rectangle = (
  left: number,
  bottom: number,
  right: number,
  top: number,
) => [
  { x: left, y: bottom },
  { x: right, y: bottom },
  { x: right, y: top },
  { x: left, y: top },
]

/** Generic declared geometry; no board catalog or DDR membership is invented. */
export const renderDdrExample = async (
  example: DdrExample,
): Promise<AnyCircuitElement[]> => {
  const hop = example === "missing-return" || example === "existing-return"
  const circuit = new Circuit()
  circuit.add(
    <board
      width={12}
      height={8}
      layers={6}
      routingDisabled
      schematicDisabled
      isViaInPadAllowed
    >
      <net name="DQ0" />
      <net name="GND" isGroundNet />
      <testpoint
        name="A"
        pcbX={example === "floating" ? 1 : -4}
        pcbY={0}
        footprintVariant="pad"
        padDiameter={0.7}
      />
      <testpoint
        name="B"
        pcbX={4}
        pcbY={0}
        layer={hop ? "bottom" : "top"}
        footprintVariant="pad"
        padDiameter={0.7}
      />
      <testpoint
        name="GA"
        pcbX={-4}
        pcbY={-2}
        footprintVariant="pad"
        padDiameter={0.7}
      />
      <testpoint
        name="GB"
        pcbX={4}
        pcbY={-2}
        layer={hop ? "bottom" : "top"}
        footprintVariant="pad"
        padDiameter={0.7}
      />
      <trace from=".A > .pin1" to="net.DQ0" />
      <trace
        from=".A > .pin1"
        to=".B > .pin1"
        thickness={0.15}
        pcbPath={
          hop
            ? [
                { x: 4, y: 0 },
                { x: 4, y: 0, via: true, toLayer: "bottom" },
              ]
            : [".B > .pin1"]
        }
      />
      <trace from=".GA > .pin1" to="net.GND" />
      <trace from=".GB > .pin1" to="net.GND" />
      <via
        name="anchorA"
        pcbX={-4}
        pcbY={-2}
        fromLayer="top"
        toLayer="inner1"
        connectsTo="net.GND"
        outerDiameter={0.6}
        holeDiameter={0.25}
      />
      {example !== "floating" && (
        <via
          name="anchorB"
          pcbX={4}
          pcbY={-2}
          fromLayer={hop ? "inner4" : "top"}
          toLayer={hop ? "bottom" : "inner1"}
          connectsTo="net.GND"
          outerDiameter={0.6}
          holeDiameter={0.25}
        />
      )}
      {example === "existing-return" && (
        <via
          name="return"
          pcbX={0}
          pcbY={-0.8}
          fromLayer="top"
          toLayer="bottom"
          connectsTo="net.GND"
          outerDiameter={0.6}
          holeDiameter={0.25}
        />
      )}
      {example === "gap" || example === "floating" ? (
        <>
          <copperpour
            layer="inner1"
            connectsTo="net.GND"
            outline={rectangle(-5.5, -3.5, -0.4, 3.5)}
          />
          <copperpour
            layer="inner1"
            connectsTo="net.GND"
            outline={rectangle(0.4, -3.5, 5.5, 3.5)}
          />
        </>
      ) : (
        <copperpour
          layer="inner1"
          connectsTo="net.GND"
          outline={rectangle(-5.5, -3.5, 5.5, 3.5)}
        />
      )}
      {hop && (
        <copperpour
          layer="inner4"
          connectsTo="net.GND"
          outline={rectangle(-5.5, -3.5, 5.5, 3.5)}
        />
      )}
    </board>,
  )
  await circuit.renderUntilSettled()
  const json = circuit.getCircuitJson()
  if (json.some((e) => e.type.endsWith("error")))
    throw new Error(`Renderer errors in ${example}; inspect Circuit JSON`)
  return json
}

/** Shared by the live demo and snapshots; findings are those evaluated so far. */
export const getDdrStageFrame = (solver: DdrPlacementSolver) => ({
  step: solver.iterations,
  state: solver.getState(),
  report: solver.getString(),
  checks: solver.getReport().checks,
  svg: getSvgFromGraphicsObject(solver.visualize(), {
    backgroundColor: "white",
    svgWidth: 780,
    svgHeight: 450,
    hideInlineLabels: true,
    includeTextLabels: false,
  }).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ""),
})

// Run: bun examples/ddr-stages.tsx, then open the printed local URL.
if (import.meta.main) {
  let example: DdrExample = "gap"
  let solver = new DdrPlacementSolver(await renderDdrExample(example))
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Signal reference screening</title>
<style>body{font:16px system-ui;color:#213847;background:#fff;max-width:1050px;margin:32px auto;padding:0 24px}h1{font-size:25px}button,select{font:inherit;padding:8px 14px;margin-right:8px;background:white;border:1px solid #bccbd1;border-radius:6px}button:disabled{opacity:.4}#stage{margin-top:24px;font-weight:600}#diagram svg{width:100%;height:auto}pre{font:inherit;line-height:1.55;white-space:pre-wrap}.muted{color:#607681}#error{color:#be2845}</style>
<h1>Signal reference screening</h1><p class="muted">Generic TSX layouts. Step through the actual geometry checks.</p>
<select id="example" aria-label="Layout">${Object.entries(ddrExamples)
    .map(([key, name]) => `<option value="${key}">${name}</option>`)
    .join("")}</select>
<button id="play">Play</button><button id="step">Step</button><button id="reset">Reset</button>
<p id="stage" aria-live="polite"></p><p id="error" role="alert"></p><div id="diagram"></div><pre id="report"></pre>
<script>
const select=document.querySelector('#example'),play=document.querySelector('#play'),step=document.querySelector('#step'),reset=document.querySelector('#reset');
let playing=false,busy=false,frame,playRun=0;
function stop(){playing=false;playRun++;play.textContent='Play'}
function paint(){document.querySelector('#diagram').innerHTML=frame.svg;document.querySelector('#stage').textContent='Step '+frame.step+' · '+frame.state.stage+' · '+frame.state.status;document.querySelector('#report').textContent=frame.report.replaceAll('**','');step.disabled=frame.state.status!=='running';play.disabled=step.disabled;select.value=frame.example;if(step.disabled)stop()}
async function request(path,body){if(busy)return;busy=true;step.disabled=true;select.disabled=true;reset.disabled=true;try{const response=await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});if(!response.ok)throw Error(await response.text());frame=await response.json();document.querySelector('#error').textContent='';paint()}catch(error){stop();document.querySelector('#error').textContent=String(error)}finally{busy=false;select.disabled=false;reset.disabled=false}}
step.onclick=()=>{stop();request('/step',{})};
reset.onclick=()=>{stop();request('/reset',{example:select.value})};
select.onchange=reset.onclick;
play.onclick=async()=>{if(playing){stop();return}playing=true;const run=++playRun;play.textContent='Pause';while(playing&&run===playRun){await request('/step',{});if(playing&&run===playRun)await new Promise(resolve=>setTimeout(resolve,650))}};
request('/state');
</script></html>`
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: Number(Bun.env.DDR_DEMO_PORT ?? 3020),
    async fetch(request) {
      const path = new URL(request.url).pathname
      if (request.method === "GET" && path === "/")
        return new Response(html, { headers: { "Content-Type": "text/html" } })
      if (request.method === "POST" && path === "/reset") {
        const body = await request.json()
        if (
          typeof body !== "object" ||
          body === null ||
          !("example" in body) ||
          typeof body.example !== "string" ||
          !Object.hasOwn(ddrExamples, body.example)
        )
          return new Response("Unknown example", { status: 400 })
        const next = body.example as DdrExample
        solver = new DdrPlacementSolver(await renderDdrExample(next))
        example = next
      } else if (request.method === "POST" && path === "/step") solver.step()
      else if (request.method !== "GET" || path !== "/state")
        return new Response("Not found", { status: 404 })
      return Response.json({ example, ...getDdrStageFrame(solver) })
    },
  })
  console.log(`Open http://127.0.0.1:${server.port}`)
}
