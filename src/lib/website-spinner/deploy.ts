/**
 * Deploy a static website to Vercel via API.
 *
 * Creates a new project (or reuses existing) and deploys HTML files.
 * Each tenant website is a separate Vercel project.
 *
 * Env vars:
 *   VERCEL_TOKEN — API token
 *   VERCEL_TEAM_ID — Team/scope ID (optional for personal accounts)
 */

const API = "https://api.vercel.com";

function headers() {
  return {
    Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
    "Content-Type": "application/json",
  };
}

function teamQuery(): string {
  return process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : "";
}

interface DeployFile {
  file: string;
  html: string;
}

interface DeployResult {
  success: boolean;
  url?: string;
  projectId?: string;
  deploymentId?: string;
  error?: string;
}

/**
 * Find or create a Vercel project for a tenant website.
 */
async function ensureProject(projectName: string): Promise<{ id: string; created: boolean }> {
  // Check if project exists
  const getRes = await fetch(`${API}/v9/projects/${projectName}${teamQuery()}`, { headers: headers() });
  if (getRes.ok) {
    const data = await getRes.json();
    return { id: data.id, created: false };
  }

  // Create project
  const createRes = await fetch(`${API}/v10/projects${teamQuery()}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      name: projectName,
      framework: null, // static
    }),
  });

  const data = await createRes.json();
  if (!createRes.ok) {
    throw new Error(data.error?.message || "Failed to create project");
  }

  return { id: data.id, created: true };
}

/**
 * Deploy files to a Vercel project.
 */
export async function deployWebsite(
  projectName: string,
  files: DeployFile[],
  domain?: string
): Promise<DeployResult> {
  if (!process.env.VERCEL_TOKEN) {
    return { success: false, error: "VERCEL_TOKEN not configured" };
  }

  try {
    // 1. Ensure project exists
    const project = await ensureProject(projectName);

    // 2. Deploy files
    const deployRes = await fetch(`${API}/v13/deployments${teamQuery()}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        name: projectName,
        files: files.map((f) => ({
          file: f.file,
          data: Buffer.from(f.html).toString("base64"),
          encoding: "base64",
        })),
        projectSettings: {
          framework: null,
        },
        target: "production",
      }),
    });

    const deployData = await deployRes.json();

    if (!deployRes.ok) {
      return {
        success: false,
        error: deployData.error?.message || JSON.stringify(deployData.error),
      };
    }

    // 3. Add custom domain if provided
    if (domain) {
      await fetch(`${API}/v10/projects/${project.id}/domains${teamQuery()}`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ name: domain }),
      });
    }

    return {
      success: true,
      url: `https://${deployData.url}`,
      projectId: project.id,
      deploymentId: deployData.id,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
