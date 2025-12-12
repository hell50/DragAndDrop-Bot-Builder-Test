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


def export_code(nodes, connections):
    """Generate a Python bot code string from nodes and connections.

    nodes: dict mapping node_id to node dict: {"id": id, "type": node_type, "props": {...}}
    connections: list of (start_id, end_id)
    """
    code_lines = [
        "import discord",
        "from discord.ext import commands",
        "",
        "intents = discord.Intents.default()",
        "intents.message_content = True",
        "bot = commands.Bot(command_prefix='!', intents=intents)",
        ""
    ]

    # Find event/command nodes
    roots = [n for n in nodes.values() if NODE_TYPES[n["type"]]["type"] == "event"]

    for root in roots:
        func_name = f"cmd_{root['id']}"
        props = root.get("props", {}).copy()
        props["func_name"] = func_name
        code_lines.append(NODE_TYPES[root["type"]]["code_start"].format(**props))

        # Iterate downstream
        curr_id = root["id"]
        visited = set()
        while True:
            next_conn = next((c for c in connections if c[0] == curr_id), None)
            if not next_conn:
                break
            target_id = next_conn[1]
            if target_id in visited:
                break
            visited.add(target_id)
            node = nodes[target_id]
            nt_def = NODE_TYPES[node["type"]]
            if nt_def.get("code"):
                code_lines.append(nt_def["code"].format(**node.get("props", {})))
            curr_id = target_id

        code_lines.append("")

    code_lines.append("bot.run('YOUR_TOKEN_HERE')")
    return "\n".join(code_lines)
