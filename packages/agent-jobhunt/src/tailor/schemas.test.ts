import { describe, it, expect } from "vitest";
import { resumeDraftToYaml } from "./schemas";

// Minimal valid-shaped draft; only `skills` matters to the converter, the rest
// is spread through unchanged.
const base = {
  profile: {
    name: "Ada",
    title: "Engineer",
    location: "Annecy, FR",
    phone: "+33",
    email: "ada@example.com",
    links: [],
  },
  summary: "summary",
  experience: [],
  education: [],
};

describe("resumeDraftToYaml", () => {
  it("converts the skills array into a keyed map", () => {
    const out = resumeDraftToYaml({
      ...base,
      skills: [
        { category: "Frontend", items: ["React", "Vue"] },
        { category: "Backend", items: ["Node"] },
      ],
    });
    expect(out.skills).toEqual({
      Frontend: ["React", "Vue"],
      Backend: ["Node"],
    });
  });

  it("maps an empty skills array to an empty object", () => {
    const out = resumeDraftToYaml({ ...base, skills: [] });
    expect(out.skills).toEqual({});
  });

  it("keeps the last value when a category is duplicated", () => {
    const out = resumeDraftToYaml({
      ...base,
      skills: [
        { category: "Cloud", items: ["AWS"] },
        { category: "Cloud", items: ["GCP"] },
      ],
    });
    expect(out.skills).toEqual({ Cloud: ["GCP"] });
  });

  it("preserves non-skill fields", () => {
    const out = resumeDraftToYaml({ ...base, summary: "hi", skills: [] });
    expect(out.summary).toBe("hi");
    expect(out.profile.name).toBe("Ada");
  });
});
