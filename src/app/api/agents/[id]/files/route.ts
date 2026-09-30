import { getAgent } from "@/lib/agents";
import { vmPaths } from "@/lib/engines";
import { currentUser } from "@/lib/session";
import { getVmProvider, run, shellQuote, sh } from "@/lib/vm";

export const maxDuration = 120;

const MAX_FILE = 200_000;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const agent = await getAgent(user.id, id);
  if (!agent) return Response.json({ error: "Not found" }, { status: 404 });
  if (agent.vmStatus === "none") return Response.json({ files: [], note: "VM not booted yet" });

  const vm = await getVmProvider(agent.vmProvider).open(agent.vmName);
  const p = vmPaths(vm.root);
  const file = new URL(req.url).searchParams.get("path");

  if (file) {
    if (file.includes("..") || file.startsWith("/")) {
      return Response.json({ error: "Bad path" }, { status: 400 });
    }
    const content = await vm.readFile(`${p.workspace}/${file}`);
    if (content === null) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({
      path: file,
      content: content.length > MAX_FILE ? content.slice(0, MAX_FILE) + "\n… (truncated)" : content,
    });
  }

  const res = await run(
    vm,
    sh(
      `cd ${shellQuote(p.workspace)} 2>/dev/null && find . -mindepth 1 -maxdepth 4 ` +
        `\\( -name node_modules -o -name .git -o -name __pycache__ -o -name .venv \\) -prune -o ` +
        `-type f -printf '%s\\t%P\\n' 2>/dev/null | sort -t$'\\t' -k2 | head -500`,
    ),
  );
  const files = res.stdout
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [size, path] = l.split("\t");
      return { path, size: Number(size) };
    });
  return Response.json({ files });
}
