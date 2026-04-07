import { NextResponse } from "next/server";
import { callGLM, extractJSON } from "@/lib/glm";
import { buildIdeasPrompt } from "@/lib/prompts";
import { getActiveIdeas, setActiveBattle } from "@/lib/store";

interface RawIdea {
  title: string;
  description: string;
}

function fallbackIdeas(): RawIdea[] {
  return [
    {
      title: "Invoice Follow-up Copilot",
      description:
        "For freelance operators, it flags overdue invoices and drafts polite follow-ups so cash flow delays get resolved faster.",
    },
    {
      title: "Churn Rescue Inbox",
      description:
        "For SaaS support teams, it surfaces at-risk accounts from ticket tone and response lag so reps can intervene before cancellation.",
    },
    {
      title: "Deal Desk Snapshot",
      description:
        "For sales managers, it summarizes discount requests and approval blockers so enterprise deals close with fewer internal delays.",
    },
    {
      title: "Refund Reason Radar",
      description:
        "For ecommerce founders, it clusters refund reasons into fixable product issues so repeat returns and support costs drop.",
    },
    {
      title: "Content Repurpose Queue",
      description:
        "For creator teams, it converts long-form posts into short channel-ready drafts so publishing output increases without extra headcount.",
    },
    {
      title: "Interview Debrief Board",
      description:
        "For hiring teams, it structures interview notes into comparable scorecards so decision meetings are faster and less biased.",
    },
    {
      title: "No-show Recovery CRM",
      description:
        "For clinics and service businesses, it detects likely no-shows and triggers reminder sequences so appointment utilization improves.",
    },
    {
      title: "SLA Breach Predictor",
      description:
        "For customer success leaders, it predicts which accounts may miss SLA thresholds so escalation starts before penalties apply.",
    },
    {
      title: "Renewal Prep Tracker",
      description:
        "For account managers, it compiles usage gaps and value proofs ahead of renewals so negotiations start with stronger leverage.",
    },
    {
      title: "Meeting Action Closer",
      description:
        "For operations teams, it turns meeting notes into tracked owners and due dates so action items do not disappear post-call.",
    },
    {
      title: "Onboarding Friction Map",
      description:
        "For product teams, it identifies where trial users stall during setup so activation bottlenecks can be fixed quickly.",
    },
    {
      title: "Policy QA Assistant",
      description:
        "For compliance managers, it checks draft policies against missing controls so audit prep time is reduced.",
    },
  ];
}

export async function POST() {
  try {
    let parsed: RawIdea[] = [];

    try {
      const raw = await callGLM(buildIdeasPrompt(), 0.7, { model: "glm-4.7-flash" });
      parsed = extractJSON<RawIdea[]>(raw);
    } catch {
      parsed = fallbackIdeas();
    }

    const ideas = await setActiveBattle(parsed.slice(0, 12));
    return NextResponse.json({ ideas });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    let ideas = await getActiveIdeas();
    if (ideas.length === 0) {
      ideas = await setActiveBattle(fallbackIdeas());
    }
    return NextResponse.json({ ideas });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
