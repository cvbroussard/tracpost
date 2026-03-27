/**
 * Two-tier content pillar system.
 *
 * Pillars are broad content categories used for scheduling rotation.
 * Tags are specific content signals that guide AI generation.
 *
 * The pillar_config on sites stores the full structure.
 * Triage assigns both a pillar (broad) and tags (specific).
 * Blog/caption generators use tags for precise content direction.
 */

export interface PillarTag {
  id: string;
  label: string;
}

export interface Pillar {
  id: string;
  label: string;
  description: string; // AI reads this to understand the pillar
  tags: PillarTag[];
}

export type PillarConfig = Pillar[];

/**
 * Generate a default pillar config for a business type.
 * Industry-agnostic structure with type-specific labels.
 */
export function generateDefaultPillars(businessType: string): PillarConfig {
  const bt = businessType.toLowerCase();

  // Construction / Remodeling / Trades
  if (bt.includes("kitchen") || bt.includes("remodel") || bt.includes("contractor") || bt.includes("construction") || bt.includes("design")) {
    return [
      {
        id: "design",
        label: "Design",
        description: "Layouts, spatial planning, materials, finishes, surfaces, color, lighting, architectural decisions",
        tags: [
          { id: "layouts", label: "Layouts & Floor Plans" },
          { id: "materials", label: "Materials & Finishes" },
          { id: "surfaces", label: "Surfaces & Countertops" },
          { id: "color_palette", label: "Color & Palette" },
          { id: "lighting", label: "Lighting Design" },
          { id: "cabinetry", label: "Cabinetry & Storage" },
        ],
      },
      {
        id: "performance",
        label: "Performance",
        description: "Equipment, appliances, ventilation, infrastructure, workflow optimization, clearances, utilities",
        tags: [
          { id: "appliances", label: "Appliances & Equipment" },
          { id: "ventilation", label: "Ventilation & Hoods" },
          { id: "workflow", label: "Workflow & Ergonomics" },
          { id: "infrastructure", label: "Electrical, Plumbing & Gas" },
          { id: "clearances", label: "Clearances & Code" },
        ],
      },
      {
        id: "craft",
        label: "Craft",
        description: "Vendor partnerships, custom fabrication, artisan techniques, specialized trades, material sourcing",
        tags: [
          { id: "vendors", label: "Vendor Partnerships" },
          { id: "custom_fab", label: "Custom Fabrication" },
          { id: "techniques", label: "Techniques & Methods" },
          { id: "sourcing", label: "Material Sourcing" },
        ],
      },
      {
        id: "projects",
        label: "Projects",
        description: "Completed work, before/after transformations, client stories, project narratives, reveals",
        tags: [
          { id: "before_after", label: "Before & After" },
          { id: "client_story", label: "Client Stories" },
          { id: "reveal", label: "Project Reveals" },
          { id: "in_progress", label: "Work in Progress" },
        ],
      },
      {
        id: "lifestyle",
        label: "Lifestyle",
        description: "How the finished space gets used, entertaining, cooking culture, gear, recipes, community",
        tags: [
          { id: "entertaining", label: "Entertaining & Hosting" },
          { id: "culture", label: "Culinary Culture" },
          { id: "gear", label: "Gear & Tools" },
          { id: "community", label: "Local Community" },
        ],
      },
    ];
  }

  // Restaurant / Food Service
  if (bt.includes("restaurant") || bt.includes("food") || bt.includes("cafe") || bt.includes("bakery")) {
    return [
      {
        id: "food",
        label: "Food",
        description: "Menu items, ingredients, preparation, plating, seasonal specials",
        tags: [
          { id: "menu", label: "Menu & Dishes" },
          { id: "ingredients", label: "Ingredients & Sourcing" },
          { id: "seasonal", label: "Seasonal Specials" },
          { id: "behind_scenes", label: "Behind the Scenes" },
        ],
      },
      {
        id: "experience",
        label: "Experience",
        description: "Ambiance, service, customer moments, events, atmosphere",
        tags: [
          { id: "ambiance", label: "Ambiance & Design" },
          { id: "events", label: "Events & Specials" },
          { id: "customer_moments", label: "Customer Moments" },
        ],
      },
      {
        id: "team",
        label: "Team",
        description: "Chef profiles, staff stories, training, partnerships",
        tags: [
          { id: "chef", label: "Chef & Kitchen" },
          { id: "staff", label: "Staff Stories" },
          { id: "partnerships", label: "Local Partnerships" },
        ],
      },
      {
        id: "community",
        label: "Community",
        description: "Local involvement, neighborhood, farm partnerships, sustainability",
        tags: [
          { id: "local", label: "Local Focus" },
          { id: "farm_to_table", label: "Farm to Table" },
          { id: "sustainability", label: "Sustainability" },
        ],
      },
    ];
  }

  // Pet / Training / Services
  if (bt.includes("dog") || bt.includes("pet") || bt.includes("training") || bt.includes("grooming")) {
    return [
      {
        id: "results",
        label: "Results",
        description: "Training outcomes, transformations, before/after behavior, client success stories",
        tags: [
          { id: "transformation", label: "Transformations" },
          { id: "testimonial", label: "Client Stories" },
          { id: "milestone", label: "Milestones" },
        ],
      },
      {
        id: "training",
        label: "Training",
        description: "Techniques, methods, exercises, tips, educational content",
        tags: [
          { id: "technique", label: "Techniques & Methods" },
          { id: "tips", label: "Tips & Advice" },
          { id: "exercises", label: "Exercises & Drills" },
        ],
      },
      {
        id: "showcase",
        label: "Showcase",
        description: "Featured animals, personalities, daily life, facility, equipment",
        tags: [
          { id: "featured", label: "Featured Animals" },
          { id: "daily_life", label: "Daily Life" },
          { id: "facility", label: "Facility & Setup" },
        ],
      },
      {
        id: "education",
        label: "Education",
        description: "Breed info, health, nutrition, behavioral science, industry knowledge",
        tags: [
          { id: "breed_info", label: "Breed Information" },
          { id: "health", label: "Health & Nutrition" },
          { id: "behavior", label: "Behavioral Science" },
        ],
      },
    ];
  }

  // Default / Generic service business
  return [
    {
      id: "expertise",
      label: "Expertise",
      description: "Technical knowledge, methods, techniques, industry insights",
      tags: [
        { id: "methods", label: "Methods & Techniques" },
        { id: "insights", label: "Industry Insights" },
        { id: "education", label: "Educational Content" },
      ],
    },
    {
      id: "work",
      label: "Work",
      description: "Projects, case studies, results, before/after, client stories",
      tags: [
        { id: "projects", label: "Project Showcase" },
        { id: "results", label: "Results & Outcomes" },
        { id: "client_stories", label: "Client Stories" },
      ],
    },
    {
      id: "craft",
      label: "Craft",
      description: "Tools, materials, vendors, partnerships, sourcing, techniques",
      tags: [
        { id: "tools", label: "Tools & Equipment" },
        { id: "materials", label: "Materials & Supplies" },
        { id: "vendors", label: "Vendor Partnerships" },
      ],
    },
    {
      id: "culture",
      label: "Culture",
      description: "Team, community, behind the scenes, values, local involvement",
      tags: [
        { id: "team", label: "Team & Culture" },
        { id: "community", label: "Community" },
        { id: "behind_scenes", label: "Behind the Scenes" },
      ],
    },
  ];
}

/**
 * Flatten a pillar config into a simple list of all tag IDs.
 */
export function getAllTagIds(config: PillarConfig): string[] {
  return config.flatMap((p) => p.tags.map((t) => t.id));
}

/**
 * Find which pillar a tag belongs to.
 */
export function findPillarForTag(config: PillarConfig, tagId: string): string | null {
  for (const pillar of config) {
    if (pillar.tags.some((t) => t.id === tagId)) {
      return pillar.id;
    }
  }
  return null;
}

/**
 * Build AI guidance text from pillar config.
 * Used in triage and blog generation prompts.
 */
export function buildPillarGuidance(config: PillarConfig): string {
  return config.map((p) => {
    const tagList = p.tags.map((t) => t.label).join(", ");
    return `**${p.label}** (${p.id}): ${p.description}\n  Tags: ${tagList}`;
  }).join("\n\n");
}
