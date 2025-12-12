import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import math
import json

# --- Constants & Config ---
GRID_SIZE = 20
NODE_WIDTH = 140
NODE_HEIGHT = 60
PORT_RADIUS = 6
HEADER_HEIGHT = 25

COLORS = {
    "bg": "#2C2F33",
    "grid": "#23272A",
    "node_bg": "#99AAB5",
    "node_header": "#7289DA",
    "node_outline": "#23272A",
    "wire": "#FFFFFF",
    "wire_active": "#7289DA",
    "text": "#FFFFFF"
}

# --- Node Definitions ---
# Defines the logic and properties for each available node type
NODE_TYPES = {
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
        "props": [("Trigger (!name)", "trigger", "hello")]
    },
    "Send Message": {
        "type": "action",
        "code": "    await ctx.send('{text}')",
        "inputs": ["Flow"],
        "outputs": ["Flow"],
        "props": [("Message Text", "text", "Hello World!")]
    },
    "Reply to User": {
        "type": "action",
        "code": "    await ctx.reply('{text}')",
        "inputs": ["Flow"],
        "outputs": ["Flow"],
        "props": [("Reply Text", "text", "I hear you!")]
    },
    "Print Console": {
        "type": "action",
        "code": "    print('{text}')",
        "inputs": ["Flow"],
        "outputs": ["Flow"],
        "props": [("Log Text", "text", "Debug message")]
    }
}

class Node:
    def __init__(self, canvas, node_type, x, y, node_id):
        self.canvas = canvas
        self.node_type = node_type
        self.id = node_id
        self.x = x
        self.y = y
        self.w = NODE_WIDTH
        self.h = NODE_HEIGHT
        
        self.definition = NODE_TYPES[node_type]
        self.properties = {p[1]: p[2] for p in self.definition["props"]}
        
        # UI Elements IDs
        self.shapes = []
        self.input_ports = [] # (id, x, y)
        self.output_ports = [] # (id, x, y)
        
        self.draw()

    def draw(self):
        # Clear old shapes
        for s in self.shapes:
            self.canvas.delete(s)
        self.shapes = []
        self.input_ports = []
        self.output_ports = []

        # Body
        body = self.canvas.create_rectangle(
            self.x, self.y, self.x + self.w, self.y + self.h,
            fill=COLORS["node_bg"], outline=COLORS["node_outline"], width=2, tags=("node", self.id)
        )
        self.shapes.append(body)

        # Header
        header = self.canvas.create_rectangle(
            self.x, self.y, self.x + self.w, self.y + HEADER_HEIGHT,
            fill=COLORS["node_header"], outline=COLORS["node_outline"], width=1, tags=("node", self.id)
        )
        self.shapes.append(header)

        # Title
        text = self.canvas.create_text(
            self.x + 5, self.y + HEADER_HEIGHT/2,
            text=self.node_type, anchor="w", fill=COLORS["text"], font=("Arial", 9, "bold"), tags=("node", self.id)
        )
        self.shapes.append(text)

        # Inputs
        if self.definition["inputs"]:
            py = self.y + self.h/2
            pid = self.canvas.create_oval(
                self.x - PORT_RADIUS, py - PORT_RADIUS,
                self.x + PORT_RADIUS, py + PORT_RADIUS,
                fill=COLORS.get("wire", "orange"), outline="black", tags=("port_in", self.id)
            )
            self.shapes.append(pid)
            self.input_ports.append((pid, self.x, py))

        # Outputs
        if self.definition["outputs"]:
            py = self.y + self.h/2
            pid = self.canvas.create_oval(
                self.x + self.w - PORT_RADIUS, py - PORT_RADIUS,
                self.x + self.w + PORT_RADIUS, py + PORT_RADIUS,
                fill=COLORS.get("wire", "orange"), outline="black", tags=("port_out", self.id)
            )
            self.shapes.append(pid)
            self.output_ports.append((pid, self.x + self.w, py))

    def move(self, dx, dy):
        self.x += dx
        self.y += dy
        for s in self.shapes:
            self.canvas.move(s, dx, dy)
        
        # Update port coordinates
        new_ins = []
        for pid, ox, oy in self.input_ports:
            new_ins.append((pid, ox+dx, oy+dy))
        self.input_ports = new_ins

        new_outs = []
        for pid, ox, oy in self.output_ports:
            new_outs.append((pid, ox+dx, oy+dy))
        self.output_ports = new_outs

    def get_port_center(self, port_type):
        if port_type == "in" and self.input_ports:
            return self.input_ports[0][1:] # x, y
        if port_type == "out" and self.output_ports:
            return self.output_ports[0][1:]
        return None

class BotBuilderApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Discord Bot Logic Builder")
        self.root.geometry("1000x700")
        
        # Data
        self.nodes = {} # id -> Node
        self.connections = [] # (start_node_id, end_node_id)
        self.node_counter = 0
        
        # State
        self.drag_data = {"item": None, "x": 0, "y": 0}
        self.wire_start = None
        self.selected_node_id = None

        self._init_ui()

    def _init_ui(self):
        # Layout
        self.main_container = tk.PanedWindow(self.root, orient=tk.HORIZONTAL)
        self.main_container.pack(fill=tk.BOTH, expand=True)

        # Sidebar (Properties)
        self.sidebar = tk.Frame(self.main_container, width=250, bg=COLORS["bg"])
        self.main_container.add(self.sidebar)
        
        tk.Label(self.sidebar, text="Properties", bg=COLORS["bg"], fg=COLORS["text"], font=("Arial", 12, "bold")).pack(pady=10)
        self.props_frame = tk.Frame(self.sidebar, bg=COLORS["bg"])
        self.props_frame.pack(fill=tk.BOTH, expand=True, padx=5)

        # Export Button
        btn_frame = tk.Frame(self.sidebar, bg=COLORS["bg"])
        btn_frame.pack(side=tk.BOTTOM, fill=tk.X, pady=10, padx=10)
        tk.Button(btn_frame, text="Export Bot.py", command=self.export_bot, bg="#7289DA", fg=COLORS["text"], font=("Arial", 10, "bold")).pack(fill=tk.X)

        # Canvas Area
        self.canvas_frame = tk.Frame(self.main_container, bg=COLORS["grid"])
        self.main_container.add(self.canvas_frame)

        self.canvas = tk.Canvas(self.canvas_frame, bg=COLORS["grid"], highlightthickness=0)
        self.canvas.pack(fill=tk.BOTH, expand=True)
        
        self._draw_grid()

        # Bindings
        self.canvas.bind("<Button-1>", self.on_click)
        self.canvas.bind("<B1-Motion>", self.on_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_release)
        # Right click menu; on macOS this is sometimes Button-2
        self.canvas.bind("<Button-3>", self.show_context_menu)
        self.canvas.bind("<Button-2>", self.show_context_menu)
        # Key bindings on root so they work when the canvas isn't focused
        self.root.bind("<Delete>", self.delete_selection)
        self.root.bind("<BackSpace>", self.delete_selection)

        # Context Menu
        self.context_menu = tk.Menu(self.root, tearoff=0)
        for ntype in NODE_TYPES.keys():
            self.context_menu.add_command(label=f"Add {ntype}", command=lambda t=ntype: self.add_node(t))

    def _draw_grid(self):
        # Draw grid based on the current canvas size
        self.canvas.delete('grid_line')
        try:
            w = int(self.canvas.winfo_width())
            h = int(self.canvas.winfo_height())
        except Exception:
            w = 2000
            h = 2000
        if w <= 1:
            w = 2000
        if h <= 1:
            h = 2000
        for i in range(0, w, GRID_SIZE):
            self.canvas.create_line([(i, 0), (i, h)], tag='grid_line', fill="#23272A")
        for i in range(0, h, GRID_SIZE):
            self.canvas.create_line([(0, i), (w, i)], tag='grid_line', fill="#23272A")

        # No binding here; the configure event is bound once in _init_ui to redraw on resize

    def show_context_menu(self, event):
        self.drag_data["x"] = event.x
        self.drag_data["y"] = event.y
        # Ensure keyboard events and bindings work after the context menu
        try:
            self.canvas.focus_set()
        except Exception:
            pass
        self.context_menu.post(event.x_root, event.y_root)

    def add_node(self, node_type):
        uid = f"node_{self.node_counter}"
        self.node_counter += 1
        x, y = self.drag_data["x"], self.drag_data["y"]
        node = Node(self.canvas, node_type, x, y, uid)
        self.nodes[uid] = node

        # Ensure new node is focused when created to make keyboard events work
        try:
            self.canvas.focus_set()
        except Exception:
            pass

    def on_click(self, event):
        # Ensure the canvas has focus to respond to keyboard events
        try:
            self.canvas.focus_set()
        except Exception:
            pass

        # Check for port click (Wiring)
        item = self.canvas.find_closest(event.x, event.y)[0]
        tags = self.canvas.gettags(item)
        
        if "port_out" in tags:
            node_id = next((t for t in tags if t.startswith('node_')), None)
            if node_id is None:
                return
            self.wire_start = node_id
            return

        # Check for node click (Selection/Dragging)
        if "node" in tags:
            node_id = next((t for t in tags if t.startswith('node_')), None)
            # Clear previous selection highlight
            if self.selected_node_id and self.selected_node_id != node_id:
                try:
                    self.unhighlight_node(self.selected_node_id)
                except Exception:
                    pass
            self.selected_node_id = node_id
            self.drag_data["item"] = node_id
            self.drag_data["x"] = event.x
            self.drag_data["y"] = event.y
            # Bring node to front so it appears above other nodes/wires
            try:
                for s in self.nodes[node_id].shapes:
                    self.canvas.tag_raise(s)
            except Exception:
                pass
            self.show_properties(node_id)
            return
        
        # Clicked whitespace
        if self.selected_node_id:
            try:
                self.unhighlight_node(self.selected_node_id)
            except Exception:
                pass
        self.selected_node_id = None
        self.show_properties(None)

    def on_drag(self, event):
        # Dragging Wire
        if self.wire_start:
            self.canvas.delete("temp_wire")
            start_node = self.nodes[self.wire_start]
            sx, sy = start_node.get_port_center("out")
            self.canvas.create_line(sx, sy, event.x, event.y, fill=COLORS["wire_active"], width=2, tags="temp_wire")
            return

        # Dragging Node
        if self.drag_data["item"]:
            dx = event.x - self.drag_data["x"]
            dy = event.y - self.drag_data["y"]
            self.nodes[self.drag_data["item"]].move(dx, dy)
            self.drag_data["x"] = event.x
            self.drag_data["y"] = event.y
            self.redraw_wires()

    def on_release(self, event):
        # Finishing Wire
        if self.wire_start:
            self.canvas.delete("temp_wire")
            item = self.canvas.find_closest(event.x, event.y)[0]
            tags = self.canvas.gettags(item)
            if "port_in" in tags:
                end_node_id = next((t for t in tags if t.startswith('node_')), None)
                if end_node_id is None:
                    self.wire_start = None
                    return
                # Avoid duplicates and self-connection
                if end_node_id != self.wire_start and (self.wire_start, end_node_id) not in self.connections:
                    self.connections.append((self.wire_start, end_node_id))
                    self.redraw_wires()
            self.wire_start = None
            return
        
        self.drag_data["item"] = None

    def redraw_wires(self):
        self.canvas.delete("wire")
        for start_id, end_id in self.connections:
            if start_id in self.nodes and end_id in self.nodes:
                sx, sy = self.nodes[start_id].get_port_center("out")
                ex, ey = self.nodes[end_id].get_port_center("in")
                
                # Bezier-ish curve
                cx1 = sx + 50
                cy1 = sy
                cx2 = ex - 50
                cy2 = ey
                
                self.canvas.create_line(sx, sy, ex, ey, fill=COLORS["wire"], width=2, tags="wire", smooth=True)

    def show_properties(self, node_id):
        # Clear sidebar
        for widget in self.props_frame.winfo_children():
            widget.destroy()

        if not node_id or node_id not in self.nodes:
            tk.Label(self.props_frame, text="Select a node", bg=COLORS["bg"], fg="#99AAB5").pack()
            # Unhighlight any previous selection
            if self.selected_node_id:
                try:
                    self.unhighlight_node(self.selected_node_id)
                except Exception:
                    pass
            return

        # Highlight selection and clear previous highlight
        if self.selected_node_id and self.selected_node_id != node_id:
            self.unhighlight_node(self.selected_node_id)
        self.highlight_node(node_id)
        node = self.nodes[node_id]
        tk.Label(self.props_frame, text=node.node_type, bg=COLORS["bg"], fg=COLORS["text"], font=("Arial", 10, "bold")).pack(pady=5)

        for label, key, default in node.definition["props"]:
            tk.Label(self.props_frame, text=label, bg=COLORS["bg"], fg=COLORS["text"]).pack(anchor="w")
            var = tk.StringVar(value=node.properties.get(key, default))
            entry = tk.Entry(self.props_frame, textvariable=var)
            entry.pack(fill=tk.X, pady=(0, 10))
            
            # Callback to update node data
            def update_prop(name=key, v=var):
                node.properties[name] = v.get()
            
            var.trace("w", lambda *args, k=key, v=var: update_prop(k, v))

    def delete_selection(self, event):
        if self.selected_node_id:
            # Remove node
            nid = self.selected_node_id
            # Clear highlight
            try:
                self.unhighlight_node(nid)
            except Exception:
                pass
            for s in self.nodes[nid].shapes:
                self.canvas.delete(s)
            del self.nodes[nid]
            
            # Remove connections
            self.connections = [c for c in self.connections if c[0] != nid and c[1] != nid]
            self.redraw_wires()
            self.selected_node_id = None
            self.show_properties(None)

    def highlight_node(self, node_id):
        if not node_id or node_id not in self.nodes:
            return
        node = self.nodes[node_id]
        if node.shapes:
            # Change outline color of body rectangle (index 0)
            try:
                body_id = node.shapes[0]
                self.canvas.itemconfig(body_id, outline=COLORS["wire_active"], width=3)
            except Exception:
                pass

    def unhighlight_node(self, node_id):
        if not node_id or node_id not in self.nodes:
            return
        node = self.nodes[node_id]
        if node.shapes:
            try:
                body_id = node.shapes[0]
                self.canvas.itemconfig(body_id, outline=COLORS["node_outline"], width=2)
            except Exception:
                pass

    def export_bot(self):
        code_lines = [
            "import discord",
            "from discord.ext import commands",
            "",
            "intents = discord.Intents.default()",
            "intents.message_content = True",
            "bot = commands.Bot(command_prefix='!', intents=intents)",
            ""
        ]

        # 1. Find Event/Command Nodes (Roots)
        roots = [n for n in self.nodes.values() if n.definition["type"] == "event"]

        for root in roots:
            # Generate header
            func_name = f"cmd_{root.id.replace('node_', '')}"
            props = root.properties.copy()
            props["func_name"] = func_name
            
            code_lines.append(root.definition["code_start"].format(**props))
            # Validation: Check for ctx usage in downstream nodes when root doesn't define ctx
            root_has_ctx = '(ctx)' in root.definition.get("code_start", "")
            if not root_has_ctx:
                # Look through connections downstream for nodes that use 'ctx'
                visited_tmp = set()
                curr_tmp = root.id
                ctx_issue = False
                while True:
                    next_conn_tmp = next((c for c in self.connections if c[0] == curr_tmp), None)
                    if not next_conn_tmp:
                        break
                    target_tmp = next_conn_tmp[1]
                    if target_tmp in visited_tmp:
                        break
                    visited_tmp.add(target_tmp)
                    tnode = self.nodes[target_tmp]
                    code_template = tnode.definition.get("code", "")
                    if 'ctx.' in code_template:
                        ctx_issue = True
                        break
                    curr_tmp = target_tmp
                if ctx_issue:
                    proceed = messagebox.askyesno(
                        "Export Warning",
                        f"Event '{root.node_type}' does not provide a 'ctx' parameter, but connected actions use 'ctx'.\nContinue exporting this event?"
                    )
                    if not proceed:
                        continue
            
            # Traverse children
            curr_id = root.id
            visited = set()
            
            while True:
                # Find connection starting from curr_id
                next_conn = next((c for c in self.connections if c[0] == curr_id), None)
                if not next_conn:
                    break
                    
                target_id = next_conn[1]
                if target_id in visited: break # Loop protection
                visited.add(target_id)
                
                node = self.nodes[target_id]
                if node.definition.get("code"):
                    # Format code with properties
                    line = node.definition["code"].format(**node.properties)
                    code_lines.append(line)
                
                curr_id = target_id
            
            code_lines.append("") # Spacer

        code_lines.append("bot.run('YOUR_TOKEN_HERE')")
        
        # Save
        f = filedialog.asksaveasfilename(defaultextension=".py", filetypes=[("Python Files", "*.py")])
        if f:
            with open(f, "w") as file:
                file.write("\n".join(code_lines))
            messagebox.showinfo("Success", "Bot code exported successfully!\nDon't forget to replace YOUR_TOKEN_HERE.")

if __name__ == "__main__":
    root = tk.Tk()
    app = BotBuilderApp(root)
    root.mainloop()