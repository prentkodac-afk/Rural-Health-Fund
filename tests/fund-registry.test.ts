import { describe, it, expect, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

interface Campaign {
  name: string;
  description: string;
  goal: number;
  raised: number;
  deadline: number;
  active: boolean;
  creator: string;
  fundsLocked: boolean;
}

interface Contribution {
  amount: number;
  timestamp: number;
}

interface CampaignAdmin {
  active: boolean;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class FundRegistryMock {
  state: {
    nextCampaignId: number;
    maxCampaigns: number;
    admin: string;
    creationFee: number;
    paused: boolean;
    campaigns: Map<number, Campaign>;
    contributions: Map<string, Contribution>;
    campaignAdmins: Map<string, CampaignAdmin>;
  } = {
    nextCampaignId: 1,
    maxCampaigns: 1000,
    admin: "ST1TEST",
    creationFee: 1000,
    paused: false,
    campaigns: new Map(),
    contributions: new Map(),
    campaignAdmins: new Map(),
  };
  blockHeight: number = 100;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];

  reset(): void {
    this.state = {
      nextCampaignId: 1,
      maxCampaigns: 1000,
      admin: "ST1TEST",
      creationFee: 1000,
      paused: false,
      campaigns: new Map(),
      contributions: new Map(),
      campaignAdmins: new Map(),
    };
    this.blockHeight = 100;
    this.caller = "ST1TEST";
    this.stxTransfers = [];
  }

  getCampaign(campaignId: number): Result<Campaign | null> {
    return { ok: true, value: this.state.campaigns.get(campaignId) || null };
  }

  getContribution(campaignId: number, contributor: string): Result<Contribution | null> {
    return { ok: true, value: this.state.contributions.get(`${campaignId}-${contributor}`) || null };
  }

  isAdmin(campaignId: number, admin: string): Result<boolean> {
    return { ok: true, value: this.state.campaignAdmins.get(`${campaignId}-${admin}`)?.active || false };
  }

  isPaused(): Result<boolean> {
    return { ok: true, value: this.state.paused };
  }

  getCampaignCount(): Result<number> {
    return { ok: true, value: this.state.nextCampaignId };
  }

  setAdmin(newAdmin: string): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    this.state.admin = newAdmin;
    return { ok: true, value: true };
  }

  setCreationFee(newFee: number): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    if (newFee < 0) return { ok: false, value: false };
    this.state.creationFee = newFee;
    return { ok: true, value: true };
  }

  togglePause(): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    this.state.paused = !this.state.paused;
    return { ok: true, value: true };
  }

  addCampaignAdmin(campaignId: number, admin: string): Result<boolean> {
    const campaign = this.state.campaigns.get(campaignId);
    if (!campaign) return { ok: false, value: false };
    if (this.caller !== campaign.creator) return { ok: false, value: false };
    this.state.campaignAdmins.set(`${campaignId}-${admin}`, { active: true });
    return { ok: true, value: true };
  }

  removeCampaignAdmin(campaignId: number, admin: string): Result<boolean> {
    const campaign = this.state.campaigns.get(campaignId);
    if (!campaign) return { ok: false, value: false };
    if (this.caller !== campaign.creator) return { ok: false, value: false };
    this.state.campaignAdmins.set(`${campaignId}-${admin}`, { active: false });
    return { ok: true, value: true };
  }

  createCampaign(name: string, description: string, goal: number, duration: number): Result<number> {
    if (this.state.paused) return { ok: false, value: 100 };
    if (this.state.nextCampaignId >= this.state.maxCampaigns) return { ok: false, value: 110 };
    if (!name || name.length > 100) return { ok: false, value: 106 };
    if (description.length > 500) return { ok: false, value: 107 };
    if (goal <= 0) return { ok: false, value: 104 };
    if (duration <= 0) return { ok: false, value: 105 };
    this.stxTransfers.push({ amount: this.state.creationFee, from: this.caller, to: this.state.admin });
    const campaignId = this.state.nextCampaignId;
    const campaign: Campaign = {
      name,
      description,
      goal,
      raised: 0,
      deadline: this.blockHeight + duration,
      active: true,
      creator: this.caller,
      fundsLocked: false,
    };
    this.state.campaigns.set(campaignId, campaign);
    this.state.campaignAdmins.set(`${campaignId}-${this.caller}`, { active: true });
    this.state.nextCampaignId++;
    return { ok: true, value: campaignId };
  }

  contribute(campaignId: number, amount: number): Result<boolean> {
    const campaign = this.state.campaigns.get(campaignId);
    if (!campaign) return { ok: false, value: false };
    if (this.state.paused) return { ok: false, value: false };
    if (!campaign.active) return { ok: false, value: false };
    if (this.blockHeight > campaign.deadline) return { ok: false, value: false };
    if (campaign.fundsLocked) return { ok: false, value: false };
    if (amount <= 0) return { ok: false, value: false };
    this.stxTransfers.push({ amount, from: this.caller, to: "contract" });
    const updatedCampaign = { ...campaign, raised: campaign.raised + amount };
    this.state.campaigns.set(campaignId, updatedCampaign);
    this.state.contributions.set(`${campaignId}-${this.caller}`, { amount, timestamp: this.blockHeight });
    return { ok: true, value: true };
  }

  lockFunds(campaignId: number): Result<boolean> {
    const campaign = this.state.campaigns.get(campaignId);
    if (!campaign) return { ok: false, value: false };
    if (!this.state.campaignAdmins.get(`${campaignId}-${this.caller}`)?.active) return { ok: false, value: false };
    if (!campaign.active) return { ok: false, value: false };
    this.state.campaigns.set(campaignId, { ...campaign, fundsLocked: true });
    return { ok: true, value: true };
  }

  unlockFunds(campaignId: number): Result<boolean> {
    const campaign = this.state.campaigns.get(campaignId);
    if (!campaign) return { ok: false, value: false };
    if (!this.state.campaignAdmins.get(`${campaignId}-${this.caller}`)?.active) return { ok: false, value: false };
    if (!campaign.active) return { ok: false, value: false };
    this.state.campaigns.set(campaignId, { ...campaign, fundsLocked: false });
    return { ok: true, value: true };
  }

  endCampaign(campaignId: number): Result<boolean> {
    const campaign = this.state.campaigns.get(campaignId);
    if (!campaign) return { ok: false, value: false };
    if (!this.state.campaignAdmins.get(`${campaignId}-${this.caller}`)?.active) return { ok: false, value: false };
    if (!campaign.active) return { ok: false, value: false };
    this.state.campaigns.set(campaignId, { ...campaign, active: false });
    return { ok: true, value: true };
  }

  withdrawFunds(campaignId: number, recipient: string, amount: number): Result<boolean> {
    const campaign = this.state.campaigns.get(campaignId);
    if (!campaign) return { ok: false, value: false };
    if (!this.state.campaignAdmins.get(`${campaignId}-${this.caller}`)?.active) return { ok: false, value: false };
    if (campaign.active) return { ok: false, value: false };
    if (amount > campaign.raised) return { ok: false, value: false };
    if (amount <= 0) return { ok: false, value: false };
    this.stxTransfers.push({ amount, from: "contract", to: recipient });
    this.state.campaigns.set(campaignId, { ...campaign, raised: campaign.raised - amount });
    return { ok: true, value: true };
  }
}

describe("FundRegistry", () => {
  let contract: FundRegistryMock;

  beforeEach(() => {
    contract = new FundRegistryMock();
    contract.reset();
  });

  it("creates a campaign successfully", () => {
    const result = contract.createCampaign("Health Fund", "Virtual clinic funding", 10000, 100);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
    const campaign = contract.getCampaign(1).value;
    expect(campaign?.name).toBe("Health Fund");
    expect(campaign?.description).toBe("Virtual clinic funding");
    expect(campaign?.goal).toBe(10000);
    expect(campaign?.raised).toBe(0);
    expect(campaign?.deadline).toBe(200);
    expect(campaign?.active).toBe(true);
    expect(campaign?.creator).toBe("ST1TEST");
    expect(campaign?.fundsLocked).toBe(false);
    expect(contract.stxTransfers).toEqual([{ amount: 1000, from: "ST1TEST", to: "ST1TEST" }]);
  });

  it("rejects campaign creation when paused", () => {
    contract.togglePause();
    const result = contract.createCampaign("Health Fund", "Virtual clinic funding", 10000, 100);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(100);
  });

  it("rejects invalid campaign name", () => {
    const result = contract.createCampaign("", "Virtual clinic funding", 10000, 100);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(106);
  });

  it("rejects invalid campaign description", () => {
    const longDesc = "a".repeat(501);
    const result = contract.createCampaign("Health Fund", longDesc, 10000, 100);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(107);
  });

  it("rejects invalid goal amount", () => {
    const result = contract.createCampaign("Health Fund", "Virtual clinic funding", 0, 100);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(104);
  });

  it("rejects invalid duration", () => {
    const result = contract.createCampaign("Health Fund", "Virtual clinic funding", 10000, 0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(105);
  });

  it("rejects campaign creation when max campaigns reached", () => {
    contract.state.maxCampaigns = 1;
    contract.createCampaign("Health Fund", "Virtual clinic funding", 10000, 100);
    const result = contract.createCampaign("Another Fund", "More funding", 5000, 50);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(110);
  });

  it("contributes to a campaign successfully", () => {
    contract.createCampaign("Health Fund", "Virtual clinic funding", 10000, 100);
    const result = contract.contribute(1, 500);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const campaign = contract.getCampaign(1).value;
    expect(campaign?.raised).toBe(500);
    const contribution = contract.getContribution(1, "ST1TEST").value;
    expect(contribution?.amount).toBe(500);
    expect(contribution?.timestamp).toBe(100);
    expect(contract.stxTransfers).toContainEqual({ amount: 500, from: "ST1TEST", to: "contract" });
  });

  it("rejects contribution to non-existent campaign", () => {
    const result = contract.contribute(99, 500);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects contribution when paused", () => {
    contract.createCampaign("Health Fund", "Virtual clinic funding", 10000, 100);
    contract.togglePause();
    const result = contract.contribute(1, 500);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects contribution to ended campaign", () => {
    contract.createCampaign("Health Fund", "Virtual clinic funding", 10000, 100);
    contract.endCampaign(1);
    const result = contract.contribute(1, 500);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects contribution past deadline", () => {
    contract.createCampaign("Health Fund", "Virtual clinic funding", 10000, 100);
    contract.blockHeight = 201;
    const result = contract.contribute(1, 500);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects contribution when funds locked", () => {
    contract.createCampaign("Health Fund", "Virtual clinic funding", 10000, 100);
    contract.lockFunds(1);
    const result = contract.contribute(1, 500);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects invalid contribution amount", () => {
    contract.createCampaign("Health Fund", "Virtual clinic funding", 10000, 100);
    const result = contract.contribute(1, 0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("locks funds successfully", () => {
    contract.createCampaign("Health Fund", "Virtual clinic funding", 10000, 100);
    const result = contract.lockFunds(1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const campaign = contract.getCampaign(1).value;
    expect(campaign?.fundsLocked).toBe(true);
  });

  it("rejects lock funds by non-admin", () => {
    contract.createCampaign("Health Fund", "Virtual clinic funding", 10000, 100);
    contract.caller = "ST2TEST";
    const result = contract.lockFunds(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("unlocks funds successfully", () => {
    contract.createCampaign("Health Fund", "Virtual clinic funding", 10000, 100);
    contract.lockFunds(1);
    const result = contract.unlockFunds(1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const campaign = contract.getCampaign(1).value;
    expect(campaign?.fundsLocked).toBe(false);
  });

  it("rejects unlock funds by non-admin", () => {
    contract.createCampaign("Health Fund", "Virtual clinic funding", 10000, 100);
    contract.caller = "ST2TEST";
    const result = contract.unlockFunds(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("ends campaign successfully", () => {
    contract.createCampaign("Health Fund", "Virtual clinic funding", 10000, 100);
    const result = contract.endCampaign(1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const campaign = contract.getCampaign(1).value;
    expect(campaign?.active).toBe(false);
  });

  it("rejects end campaign by non-admin", () => {
    contract.createCampaign("Health Fund", "Virtual clinic funding", 10000, 100);
    contract.caller = "ST2TEST";
    const result = contract.endCampaign(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("withdraws funds successfully", () => {
    contract.createCampaign("Health Fund", "Virtual clinic funding", 10000, 100);
    contract.contribute(1, 500);
    contract.endCampaign(1);
    const result = contract.withdrawFunds(1, "ST3RECIPIENT", 300);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const campaign = contract.getCampaign(1).value;
    expect(campaign?.raised).toBe(200);
    expect(contract.stxTransfers).toContainEqual({ amount: 300, from: "contract", to: "ST3RECIPIENT" });
  });

  it("rejects withdrawal by non-admin", () => {
    contract.createCampaign("Health Fund", "Virtual clinic funding", 10000, 100);
    contract.contribute(1, 500);
    contract.endCampaign(1);
    contract.caller = "ST2TEST";
    const result = contract.withdrawFunds(1, "ST3RECIPIENT", 300);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects withdrawal from active campaign", () => {
    contract.createCampaign("Health Fund", "Virtual clinic funding", 10000, 100);
    contract.contribute(1, 500);
    const result = contract.withdrawFunds(1, "ST3RECIPIENT", 300);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects withdrawal exceeding funds", () => {
    contract.createCampaign("Health Fund", "Virtual clinic funding", 10000, 100);
    contract.contribute(1, 500);
    contract.endCampaign(1);
    const result = contract.withdrawFunds(1, "ST3RECIPIENT", 600);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("adds campaign admin successfully", () => {
    contract.createCampaign("Health Fund", "Virtual clinic funding", 10000, 100);
    const result = contract.addCampaignAdmin(1, "ST2ADMIN");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.isAdmin(1, "ST2ADMIN").value).toBe(true);
  });

  it("rejects add campaign admin by non-creator", () => {
    contract.createCampaign("Health Fund", "Virtual clinic funding", 10000, 100);
    contract.caller = "ST2TEST";
    const result = contract.addCampaignAdmin(1, "ST3ADMIN");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("removes campaign admin successfully", () => {
    contract.createCampaign("Health Fund", "Virtual clinic funding", 10000, 100);
    contract.addCampaignAdmin(1, "ST2ADMIN");
    const result = contract.removeCampaignAdmin(1, "ST2ADMIN");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.isAdmin(1, "ST2ADMIN").value).toBe(false);
  });

  it("sets creation fee successfully", () => {
    const result = contract.setCreationFee(2000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.creationFee).toBe(2000);
    contract.createCampaign("Health Fund", "Virtual clinic funding", 10000, 100);
    expect(contract.stxTransfers).toContainEqual({ amount: 2000, from: "ST1TEST", to: "ST1TEST" });
  });

  it("rejects creation fee change by non-admin", () => {
    contract.caller = "ST2TEST";
    const result = contract.setCreationFee(2000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("toggles pause successfully", () => {
    const result = contract.togglePause();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.isPaused().value).toBe(true);
  });

  it("rejects toggle pause by non-admin", () => {
    contract.caller = "ST2TEST";
    const result = contract.togglePause();
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("parses Clarity types correctly", () => {
    const name = Cl.stringUtf8("Health Fund");
    const goal = Cl.uint(10000);
    const duration = Cl.uint(100);
    expect(name.value).toBe("Health Fund");
    expect(goal.value).toEqual(BigInt(10000));
    expect(duration.value).toEqual(BigInt(100));
  });
});