const NODE_TYPES = {
  "Event: On Ready": {
    "type": "event",
    "code_start": "@bot.event\nasync def on_ready():",
    "inputs": [],
    "outputs": ["Flow"],
    "props": []
  },
  "Command": {
    "type": "event",
    "code_start": "@bot.command(name='{trigger}')\nasync def {func_name}(ctx):",
    "inputs": [],
    "outputs": ["Flow"],
    "props": [{label: "Trigger (!name)", key: "trigger", default: "hello"}]
  },
  "Send Message": {
    "type": "action",
    "code": "    await ctx.send('{text}')",
    "inputs": ["Flow"],
    "outputs": ["Flow"],
    "props": [{label: "Message Text", key: "text", default: "Hello World!"}]
  },
  "Reply to User": {
    "type": "action",
    "code": "    await ctx.reply('{text}')",
    "inputs": ["Flow"],
    "outputs": ["Flow"],
    "props": [{label: "Reply Text", key: "text", default: "I hear you!"}]
  },
  "Print Console": {
    "type": "action",
    "code": "    print('{text}')",
    "inputs": ["Flow"],
    "outputs": ["Flow"],
    "props": [{label: "Log Text", key: "text", default: "Debug message"}]
  }
};

let nodes = {};
let connections = [];
let nodeCounter = 0;
let canvas = null;      // scrollable viewport
let stage = null;       // large surface inside canvas where nodes live
let svg = null;
let selectedNodeId = null;
let dragging = null;
let offset = {x:0, y:0};
let wireStart = null;
let tempLine = null;
let scale = 1;

function init() {
  canvas = document.getElementById('canvas');
  stage = document.getElementById('stage');
  svg = document.getElementById('wires');
  const toolbar = document.getElementById('toolbar');
  const exportBtn = document.getElementById('export');

  // Create toolbar buttons (draggable)
  Object.keys(NODE_TYPES).forEach(type => {
    const btn = document.createElement('button');
    btn.textContent = type;
    btn.draggable = true;
    btn.style.display = 'block';
    btn.style.marginBottom = '6px';
    btn.addEventListener('click', ()=> addNode(type, 300 + nodeCounter*10, 200 + nodeCounter*10));
    btn.addEventListener('dragstart', (e)=> {
      e.dataTransfer.setData('text/plain', type);
      // tiny image so cursor shows dragging
      const img = document.createElement('canvas'); img.width = 1; img.height = 1;
      e.dataTransfer.setDragImage(img, 0, 0);
    });
    toolbar.appendChild(btn);
  });

  // Save / Load buttons
  const saveBtn = document.createElement('button'); saveBtn.textContent = 'Save';
  saveBtn.onclick = saveLayout; toolbar.appendChild(saveBtn);
  const loadBtn = document.createElement('button'); loadBtn.textContent = 'Load';
  loadBtn.onclick = loadLayout; toolbar.appendChild(loadBtn);
  const clearBtn = document.createElement('button'); clearBtn.textContent = 'Clear';
  clearBtn.onclick = ()=>{ nodes={}; connections=[]; nodeCounter=0; stage.querySelectorAll('.node').forEach(n=>n.remove()); redrawWires(); document.getElementById('props').textContent='Select a node'; };
  toolbar.appendChild(clearBtn);

  exportBtn.addEventListener('click', onExport);

  // Bind events
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('keydown', onKeyDown);

  // Drag/drop from toolbar
  stage.addEventListener('dragover', (e)=> e.preventDefault());
  stage.addEventListener('drop', (e)=>{
    e.preventDefault();
    const type = e.dataTransfer.getData('text/plain');
    if (!type) return;
    const pt = getStageCoords(e.clientX, e.clientY);
    addNode(type, Math.round(pt.x-70), Math.round(pt.y-30));
  });

  // Canvas interactions
  canvas.addEventListener('click', (e) => {
    if (selectedNodeId) {
      nodes[selectedNodeId].el.classList.remove('selected');
      selectedNodeId = null;
      document.getElementById('props').textContent = 'Select a node';
    }
  });

  // Zoom with wheel
  canvas.addEventListener('wheel', (e)=>{
    if (!e.ctrlKey && Math.abs(e.deltaY) < 1) return; // on some platforms small deltas
    e.preventDefault();
    const rect = stage.getBoundingClientRect();
    const beforeX = (e.clientX - rect.left + canvas.scrollLeft)/scale;
    const beforeY = (e.clientY - rect.top + canvas.scrollTop)/scale;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(2, Math.max(0.5, scale * delta));
    scale = newScale;
    stage.style.transform = `scale(${scale})`;
    // adjust scroll to keep pointer position
    const afterX = beforeX * scale - (e.clientX - rect.left);
    const afterY = beforeY * scale - (e.clientY - rect.top);
    canvas.scrollLeft = afterX;
    canvas.scrollTop = afterY;
    redrawWires();
  }, {passive:false});
}

function addNode(type, x, y, idArg) {
  const id = idArg || ('node_' + nodeCounter++);
  // if idArg contains a higher numeric, bump counter
  if (idArg) {
    const nnum = parseInt(idArg.replace('node_',''));
    if (!isNaN(nnum)) nodeCounter = Math.max(nodeCounter, nnum+1);
  }
  const el = document.createElement('div');
  el.className = 'node';
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.dataset.id = id;

  const header = document.createElement('div');
  header.className = 'header';
  header.textContent = type;
  el.appendChild(header);

  // Editable title below header
  const title = document.createElement('div');
  title.className = 'nodetitle';
  title.contentEditable = true;
  title.spellcheck = false;
  title.textContent = type;
  title.addEventListener('blur', ()=>{
    nodes[id].label = title.textContent.trim() || type;
  });
  el.appendChild(title);

  // Ports (multiple)
  const nt = NODE_TYPES[type];
  const inCount = (nt.inputs || []).length;
  const outCount = (nt.outputs || []).length;
  // create input ports
  for (let i=0;i<inCount;i++){
    const pname = nt.inputs[i] || `in${i+1}`;
    const pin = document.createElement('div');
    pin.className = 'port in';
    pin.dataset.id = id;
    pin.dataset.portIndex = i;
    pin.title = pname;
    pin.addEventListener('click', (e)=> onPortClick(e, 'in'));
    el.appendChild(pin);
    // port label (left)
    const pl = document.createElement('div');
    pl.className = 'port-label';
    pl.textContent = pname;
    el.appendChild(pl);
  }
  // create output ports
  for (let i=0;i<outCount;i++){
    const pname = nt.outputs[i] || `out${i+1}`;
    const pout = document.createElement('div');
    pout.className = 'port out';
    pout.dataset.id = id;
    pout.dataset.portIndex = i;
    pout.title = pname;
    pout.addEventListener('click', (e)=> onPortClick(e, 'out'));
    el.appendChild(pout);
    const pl = document.createElement('div');
    pl.className = 'port-label';
    pl.textContent = pname;
    el.appendChild(pl);
  }

  // Dragging
  header.onmousedown = (e) => onNodeMouseDown(e, id);

  el.onclick = (e) => onNodeClick(e, id);

  // Append to stage (not canvas) so transform/scrolling works
  stage.appendChild(el);

  // Position ports and labels evenly along the node height
  const h = el.clientHeight || 60;
  // inputs
  const inPorts = el.querySelectorAll('.port.in');
  for (let i=0;i<inPorts.length;i++){
    const pin = inPorts[i];
    const top = Math.round(( (i+1) / (inPorts.length+1) ) * h);
    pin.style.top = top + 'px';
    // label next sibling (we appended a label after each port)
    const label = pin.nextSibling;
    if (label && label.classList && label.classList.contains('port-label')){
      label.style.left = '-72px';
      label.style.top = (top-8) + 'px';
    }
  }
  // outputs
  const outPorts = el.querySelectorAll('.port.out');
  for (let i=0;i<outPorts.length;i++){
    const pout = outPorts[i];
    const top = Math.round(( (i+1) / (outPorts.length+1) ) * h);
    pout.style.top = top + 'px';
    const label = pout.nextSibling;
    if (label && label.classList && label.classList.contains('port-label')){
      label.style.right = '-72px';
      label.style.top = (top-8) + 'px';
    }
  }

  nodes[id] = {id, type, x, y, label: type, props: {}, el, ports:{in: (nt.inputs||[]).length, out: (nt.outputs||[]).length}};
  // defaults
  if (nt.props) {
    nt.props.forEach(p => nodes[id].props[p.key] = p.default);
  }
  redrawWires();
}

function onNodeMouseDown(e, id) {
  dragging = id;
  const el = nodes[id].el;
  // store offset in stage coordinates
  const pt = getStageCoords(e.clientX, e.clientY);
  offset.x = pt.x - parseFloat(el.style.left || 0);
  offset.y = pt.y - parseFloat(el.style.top || 0);
}

function onMouseMove(e) {
  if (dragging) {
    const el = nodes[dragging].el;
    const pt = getStageCoords(e.clientX, e.clientY);
    const newX = pt.x - offset.x;
    const newY = pt.y - offset.y;
    el.style.left = Math.round(newX) + 'px';
    el.style.top = Math.round(newY) + 'px';
    nodes[dragging].x = newX;
    nodes[dragging].y = newY;
    redrawWires();
  }
  if (wireStart) {
    const p = getPortCenter(wireStart.id, 'out', wireStart.port);
    if (!p) return;
    const pt = getStageCoords(e.clientX, e.clientY);
    drawTempLine(p.x, p.y, pt.x, pt.y);
  }
}

function onMouseUp(e) {
  if (dragging) dragging = null;
  if (wireStart) {
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (target && target.classList.contains('port') && target.classList.contains('in')) {
      const endId = target.dataset.id;
      const endPort = parseInt(target.dataset.portIndex || 0);
      const startId = wireStart.id;
      const startPort = wireStart.port;
      if (endId && (endId !== startId || endPort !== startPort) && !connections.find(c=>c[0]===startId && c[1]===startPort && c[2]===endId && c[3]===endPort)) {
        connections.push([startId, startPort, endId, endPort]);
      }
    }
    wireStart = null;
    clearTempLine();
    redrawWires();
  }
}

function onNodeClick(e, id) {
  e.stopPropagation();
  selectNode(id);
}

function onPortClick(e, dir) {
  e.stopPropagation();
  const id = e.target.dataset.id;
  const pindex = parseInt(e.target.dataset.portIndex || 0);
  if (dir === 'out') {
    wireStart = {id, port: pindex};
  } else {
    // clicking input to start reverse wiring (optional)
    // allow clicking input to remove connections
  }
}

function selectNode(id) {
  if (selectedNodeId) {
    nodes[selectedNodeId].el.classList.remove('selected');
  }
  selectedNodeId = id;
  nodes[id].el.classList.add('selected');
  showProperties(id);
}

function showProperties(id) {
  const propsEl = document.getElementById('props');
  propsEl.innerHTML = '';
  if (!id) {
    propsEl.textContent = 'Select a node';
    return;
  }
  const node = nodes[id];
  const title = document.createElement('div');
  title.style.fontWeight = 'bold';
  title.textContent = node.type;
  propsEl.appendChild(title);

  // editable label
  const lblLabel = document.createElement('div');
  lblLabel.textContent = 'Label';
  propsEl.appendChild(lblLabel);
  const lblInput = document.createElement('input');
  lblInput.value = node.label || node.type;
  lblInput.oninput = ()=>{
    node.label = lblInput.value;
    const titleEl = node.el.querySelector('.nodetitle');
    if (titleEl) titleEl.textContent = node.label;
  };
  propsEl.appendChild(lblInput);

  const nt = NODE_TYPES[node.type];
  if (nt.props) {
    nt.props.forEach(p => {
      const label = document.createElement('div');
      label.textContent = p.label;
      propsEl.appendChild(label);
      const input = document.createElement('input');
      input.value = node.props[p.key] || p.default;
      input.oninput = () => node.props[p.key] = input.value;
      propsEl.appendChild(input);
    });
  }
}

function onKeyDown(e) {
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedNodeId) deleteNode(selectedNodeId);
  }
}

function deleteNode(id) {
  if (!nodes[id]) return;
  // remove connections
  connections = connections.filter(c=>c[0]!==id && c[2]!==id);
  // remove element
  nodes[id].el.remove();
  delete nodes[id];
  selectedNodeId = null;
  document.getElementById('props').textContent = 'Select a node';
  redrawWires();
}

function redrawWires() {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  connections.forEach(c => {
    const s = getPortCenter(c[0], 'out', c[1]);
    const e = getPortCenter(c[2], 'in', c[3]);
    if (!s || !e) return;
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    const dx = Math.abs(e.x - s.x);
    const cx1 = s.x + Math.min(150, dx/2);
    const cx2 = e.x - Math.min(150, dx/2);
    const d = `M ${s.x} ${s.y} C ${cx1} ${s.y}, ${cx2} ${e.y}, ${e.x} ${e.y}`;
    path.setAttribute('d', d);
    path.setAttribute('stroke', '#ffffff');
    path.setAttribute('stroke-width', Math.max(1, 2/scale));
    path.setAttribute('fill', 'none');
    svg.appendChild(path);
  });
}

function getPortCenter(nodeId, dir, portIndex=0) {
  const n = nodes[nodeId];
  if (!n) return null;
  const el = n.el;
  const rect = el.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  // convert to stage coordinates (unscaled)
  const x0 = (rect.left - stageRect.left + canvas.scrollLeft)/scale;
  const y0 = (rect.top - stageRect.top + canvas.scrollTop)/scale;
  const w = rect.width;
  const h = rect.height;
  // compute y position based on port index and total ports on that side
  if (dir === 'out') {
    const total = (n.ports && n.ports.out) || 1;
    const py = y0 + h*( (portIndex+1) / (total+1) );
    return {x: x0 + w + 6, y: py};
  } else {
    const total = (n.ports && n.ports.in) || 1;
    const py = y0 + h*( (portIndex+1) / (total+1) );
    return {x: x0 - 6, y: py};
  }
}

function getStageCoords(clientX, clientY) {
  const rect = stage.getBoundingClientRect();
  const x = (clientX - rect.left + canvas.scrollLeft)/scale;
  const y = (clientY - rect.top + canvas.scrollTop)/scale;
  return {x,y};
}

function drawTempLine(x1, y1, x2, y2) {
  if (!tempLine) {
    tempLine = document.createElementNS('http://www.w3.org/2000/svg','path');
    tempLine.setAttribute('stroke', '#7289DA');
    tempLine.setAttribute('stroke-width', Math.max(1, 2/scale));
    tempLine.setAttribute('fill', 'none');
    tempLine.setAttribute('stroke-dasharray', '6 4');
    svg.appendChild(tempLine);
  }
  const dx = Math.abs(x2 - x1);
  const cx1 = x1 + Math.min(150, dx/2);
  const cx2 = x2 - Math.min(150, dx/2);
  const d = `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;
  tempLine.setAttribute('d', d);
}

// Save current layout to localStorage
function saveLayout() {
  const payload = { nodes: [], connections };
  Object.values(nodes).forEach(n => {
    payload.nodes.push({ id: n.id, type: n.type, x: Math.round(n.x), y: Math.round(n.y), props: n.props, label: n.label, ports: n.ports });
  });
  localStorage.setItem('botbuilder_layout', JSON.stringify(payload));
  alert('Layout saved to localStorage');
}

function loadLayout() {
  const raw = localStorage.getItem('botbuilder_layout');
  if (!raw) { alert('No saved layout found'); return; }
  try {
    const payload = JSON.parse(raw);
    // clear
    connections = payload.connections || [];
    Object.keys(nodes).forEach(k=>{ if (nodes[k] && nodes[k].el) nodes[k].el.remove(); });
    nodes = {};
    nodeCounter = 0;
    // restore nodes
    (payload.nodes||[]).forEach(n => {
      addNode(n.type, n.x, n.y, n.id);
      const created = nodes[n.id];
      if (created) {
        created.props = n.props || {};
        if (n.label) {
          created.label = n.label;
          const titleEl = created.el.querySelector('.nodetitle');
          if (titleEl) titleEl.textContent = created.label;
        }
        if (n.ports) created.ports = n.ports;
      }
    });
    redrawWires();
    alert('Layout loaded');
  } catch(err) {
    alert('Failed to load layout: '+err);
  }
}

function clearTempLine() {
  if (tempLine) {
    tempLine.remove();
    tempLine = null;
  }
}

function onExport() {
  const code = exportCode();
  const blob = new Blob([code], {type: 'text/x-python'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'exported_bot.py';
  a.click();
  URL.revokeObjectURL(url);
}

function exportCode() {
  let lines = [
    "import discord",
    "from discord.ext import commands",
    "",
    "intents = discord.Intents.default()",
    "intents.message_content = True",
    "bot = commands.Bot(command_prefix='!', intents=intents)",
    ""
  ];
    const rootNodes = Object.values(nodes).filter(n => NODE_TYPES[n.type].type === 'event');
    rootNodes.forEach(root => {
    const funcName = 'cmd_' + root.id.replace('node_','');
    const props = {...root.props, func_name: funcName};
    lines.push(NODE_TYPES[root.type].code_start.replace('{func_name}', props.func_name).replace('{trigger}', props.trigger || ''));
    // traverse
    let curr = root.id;
    const visited = new Set();
    while (true) {
      const conn = connections.find(c => c[0] === curr);
      if (!conn) break;
      const target = conn[2];
      if (visited.has(target)) break;
      visited.add(target);
      const node = nodes[target];
      const nt = NODE_TYPES[node.type];
      if (nt.code) {
        // replace props
        let line = nt.code;
        Object.keys(node.props).forEach(k => {
          const re = new RegExp(`\{${k}\}`, 'g');
          line = line.replace(re, node.props[k]);
        });
        lines.push(line);
      }
      curr = target;
    }
    lines.push('');
  });
  lines.push("bot.run('YOUR_TOKEN_HERE')");
  return lines.join('\n');
}

window.addEventListener('load', init);

```

