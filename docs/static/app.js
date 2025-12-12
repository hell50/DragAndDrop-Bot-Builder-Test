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

function addNode(type, x, y) {
  const id = 'node_' + nodeCounter++;
  const el = document.createElement('div');
  el.className = 'node';
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.dataset.id = id;

  const header = document.createElement('div');
  header.className = 'header';
  header.textContent = type;
  el.appendChild(header);

  // Ports
  const hasIn = NODE_TYPES[type].inputs && NODE_TYPES[type].inputs.length;
  const hasOut = NODE_TYPES[type].outputs && NODE_TYPES[type].outputs.length;
  if (hasIn) {
    const pin = document.createElement('div');
    pin.className = 'port in';
    pin.dataset.id = id;
    pin.onclick = (e) => onPortClick(e, 'in');
    el.appendChild(pin);
  }
  if (hasOut) {
    const pout = document.createElement('div');
    pout.className = 'port out';
    pout.dataset.id = id;
    pout.onclick = (e) => onPortClick(e, 'out');
    el.appendChild(pout);
  }

  // Dragging
  header.onmousedown = (e) => onNodeMouseDown(e, id);

  el.onclick = (e) => onNodeClick(e, id);

  canvas.appendChild(el);

  nodes[id] = {id, type, x, y, props: {}, el};
  // defaults
  const nt = NODE_TYPES[type];
  if (nt.props) {
    nt.props.forEach(p => nodes[id].props[p.key] = p.default);
  }
  redrawWires();
}

function onNodeMouseDown(e, id) {
  dragging = id;
  const el = nodes[id].el;
  offset.x = e.clientX - el.offsetLeft;
  offset.y = e.clientY - el.offsetTop;
}

function onMouseMove(e) {
  if (dragging) {
    const el = nodes[dragging].el;
    const newX = e.clientX - offset.x;
    const newY = e.clientY - offset.y;
    el.style.left = newX + 'px';
    el.style.top = newY + 'px';
    nodes[dragging].x = newX;
    nodes[dragging].y = newY;
    redrawWires();
  }
  if (wireStart) {
    const p = getPortCenter(wireStart, 'out');
    if (!p) return;
    drawTempLine(p.x, p.y, e.clientX, e.clientY);
  }
}

function onMouseUp(e) {
  if (dragging) dragging = null;
  if (wireStart) {
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (target && target.classList.contains('port') && target.classList.contains('in')) {
      const endId = target.dataset.id;
      if (endId && endId !== wireStart && !connections.find(c=>c[0]===wireStart && c[1]===endId)) {
        connections.push([wireStart, endId]);
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
  if (dir === 'out') {
    wireStart = id;
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
  connections = connections.filter(c=>c[0]!==id && c[1]!==id);
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
    const s = getPortCenter(c[0], 'out');
    const e = getPortCenter(c[1], 'in');
    if (!s || !e) return;
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    const dx = Math.abs(e.x - s.x);
    const cx1 = s.x + Math.min(100, dx/2);
    const cx2 = e.x - Math.min(100, dx/2);
    const d = `M ${s.x} ${s.y} C ${cx1} ${s.y}, ${cx2} ${e.y}, ${e.x} ${e.y}`;
    path.setAttribute('d', d);
    path.setAttribute('stroke', '#ffffff');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');
    svg.appendChild(path);
  });
}

function getPortCenter(nodeId, dir) {
  const n = nodes[nodeId];
  if (!n) return null;
  const el = n.el;
  const rect = el.getBoundingClientRect();
  if (dir === 'out') {
    return {x: rect.right - 6, y: rect.top + 24};
  }
  return {x: rect.left + 6, y: rect.top + 24};
}

function drawTempLine(x1, y1, x2, y2) {
  if (!tempLine) {
    tempLine = document.createElementNS('http://www.w3.org/2000/svg','path');
    tempLine.setAttribute('stroke', '#7289DA');
    tempLine.setAttribute('stroke-width', '2');
    tempLine.setAttribute('fill', 'none');
    svg.appendChild(tempLine);
  }
  const dx = Math.abs(x2 - x1);
  const cx1 = x1 + Math.min(100, dx/2);
  const cx2 = x2 - Math.min(100, dx/2);
  const d = `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;
  tempLine.setAttribute('d', d);
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
      const target = conn[1];
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

