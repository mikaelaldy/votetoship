import { NextRequest, NextResponse } from "next/server";
import { callGLM, extractJSON } from "@/lib/glm";
import { buildIdeasPrompt } from "@/lib/prompts";
import { isAdminRequest } from "@/lib/admin";
import {
  addAdminVote,
  deleteBuildById,
  deleteIdeaById,
  getActiveIdeas,
  getVoteMap,
  resetDemoData,
  setActiveBattle,
} from "@/lib/store";

interface RawIdea {
  title: string;
  description: string;
}

function fallbackIdeas(): RawIdea[] {
  return [
    {
      title: "Proposal Follow-up Radar",
      description:
        "For agencies, it tracks stale client proposals and drafts tailored follow-ups so revenue opportunities stop slipping away.",
    },
    {
      title: "Ops Handoff Board",
      description:
        "For operations teams, it turns scattered requests into one accountable queue so ownership gaps and missed tasks drop fast.",
    },
    {
      title: "UGC Brief Builder",
      description:
        "For ecommerce teams, it packages creator briefs, deliverables, and deadlines into one hub so campaign coordination gets easier.",
    },
    {
      title: "Renewal Risk Notes",
      description:
        "For customer success, it highlights weak product adoption signals so renewal conversations can start before churn risk spikes.",
    },
    {
      title: "Service Slot Optimizer",
      description:
        "For appointment-based businesses, it fills schedule gaps with smart reminders so unused capacity turns into booked revenue.",
    },
    {
      title: "Knowledge Base Gaps",
      description:
        "For support leads, it clusters repeated ticket questions so missing docs can be fixed before queues pile up again.",
    },
    {
      title: "Compliance Doc Tracker",
      description:
        "For compliance teams, it monitors missing policy owners and stale approvals so audits stop relying on manual chasing.",
    },
    {
      title: "Lead Handoff Scorecard",
      description:
        "For sales managers, it shows where SDR-to-AE handoffs lose momentum so pipeline quality improves without extra meetings.",
    },
    {
      title: "Warehouse Delay Signals",
      description:
        "For logistics teams, it flags repeated picking bottlenecks so managers can spot staffing or process issues earlier.",
    },
    {
      title: "Creator Deal Calendar",
      description:
        "For creator agencies, it tracks brand deadlines and approval states so deal execution stops living in spreadsheets.",
    },
    {
      title: "Refund Rescue Playbooks",
      description:
        "For subscription products, it categorizes cancellation reasons so teams can test better retention offers and flows quickly.",
    },
    {
      title: "Interview Signal Matrix",
      description:
        "For hiring teams, it standardizes interviewer notes so candidate decisions become faster and less subjective.",
    },
  ];
}

async function generateFreshIdeas() {
  try {
    const raw = await callGLM(buildIdeasPrompt(), 0.7, { model: "glm-4.7-flash" });
    const parsed = extractJSON<RawIdea[]>(raw);
    return parsed.slice(0, 12);
  } catch {
    return fallbackIdeas();
  }
}

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as
      | { action: "boostIdea"; ideaId: string }
      | { action: "deleteIdea"; ideaId: string }
      | { action: "deleteBuild"; buildId: string }
      | { action: "ping" }
      | { action: "resetDemo" };

    if (body.action === "boostIdea") {
      await addAdminVote({ ideaId: body.ideaId, direction: "up" });
      const ideas = await getActiveIdeas();
      const votes = await getVoteMap(ideas.map((idea) => idea.id));
      return NextResponse.json({
        ok: true,
        ideaId: body.ideaId,
        votes,
        upvotes: votes[body.ideaId]?.up || 0,
      });
    }

    if (body.action === "deleteIdea") {
      await deleteIdeaById(body.ideaId);
      const ideas = await getActiveIdeas();
      const votes = await getVoteMap(ideas.map((idea) => idea.id));
      return NextResponse.json({ ok: true, ideas, votes });
    }

    if (body.action === "deleteBuild") {
      await deleteBuildById(body.buildId);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "ping") {
      return NextResponse.json({ ok: true });
    }

    if (body.action === "resetDemo") {
      await resetDemoData();
      const freshIdeas = await generateFreshIdeas();
      const ideas = await setActiveBattle(freshIdeas);
      return NextResponse.json({ ok: true, ideas });
    }

    return NextResponse.json({ error: "Unknown admin action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
