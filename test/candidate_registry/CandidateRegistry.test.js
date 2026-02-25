const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CandidateRegistry", function () {
  let owner, registrar, stranger;
  let rbac, auditTrail, candidateRegistry;

  const electionId = 1;

  beforeEach(async function () {
    [owner, registrar, stranger] = await ethers.getSigners();

    const Logic = await ethers.getContractFactory(
      "contracts/access/RoleBasedAccess.sol:RoleBasedAccessLogicV1"
    );
    const logic = await Logic.deploy();
    await logic.waitForDeployment();

    const RBACProxy = await ethers.getContractFactory(
      "contracts/access/RoleBasedAccessProxy.sol:RoleBasedAccessProxy"
    );
    const rbacProxy = await RBACProxy.deploy(await logic.getAddress(), owner.address);
    await rbacProxy.waitForDeployment();

    rbac = await ethers.getContractAt(
      "contracts/access/IRoleBasedAccess.sol:IRoleBasedAccess",
      await rbacProxy.getAddress()
    );

    auditTrail = await (await ethers.getContractFactory("AuditTrail"))
      .deploy(await rbacProxy.getAddress());
    await auditTrail.waitForDeployment();

    candidateRegistry = await (await ethers.getContractFactory("CandidateRegistry"))
      .deploy(await rbacProxy.getAddress(), await auditTrail.getAddress());
    await candidateRegistry.waitForDeployment();

    // Human registrar
    const REGISTRAR = await rbac.REGISTRAR_ROLE();
    await rbac.assignRole(REGISTRAR, registrar.address);
    // CandidateRegistry calls logAction inside add/remove/snapshot → needs role
    await rbac.assignRole(REGISTRAR, await candidateRegistry.getAddress());
  });

  // ── addCandidate ────────────────────────────────────────────────────────────

  it("registrar can add a single-name candidate; id starts at 1", async function () {
    await candidateRegistry.connect(registrar).addCandidate("Party A", ["Alice"]);
    expect(await candidateRegistry.getParty(1)).to.equal("Party A");
    const names = await candidateRegistry.getCandidateNames(1);
    expect(names.length).to.equal(1);
    expect(names[0]).to.equal("Alice");
  });

  it("registrar can add a multi-name candidate (parliamentary list)", async function () {
    await candidateRegistry.connect(registrar).addCandidate("Party B", ["Bob", "Carol", "Dave"]);
    const names = await candidateRegistry.getCandidateNames(1);
    expect(names.length).to.equal(3);
    expect(names[1]).to.equal("Carol");
  });

  it("ids auto-increment across multiple adds", async function () {
    await candidateRegistry.connect(registrar).addCandidate("P1", ["Alice"]);
    await candidateRegistry.connect(registrar).addCandidate("P2", ["Bob"]);
    expect(await candidateRegistry.getParty(1)).to.equal("P1");
    expect(await candidateRegistry.getParty(2)).to.equal("P2");
  });

  it("CandidateAdded event is emitted", async function () {
    await expect(
      candidateRegistry.connect(registrar).addCandidate("Party A", ["Alice"])
    ).to.emit(candidateRegistry, "CandidateAdded");
  });

  it("stranger cannot addCandidate", async function () {
    await expect(
      candidateRegistry.connect(stranger).addCandidate("X", ["Y"])
    ).to.be.revertedWith("Not authorized");
  });

  it("owner (admin) can also addCandidate", async function () {
    await candidateRegistry.connect(owner).addCandidate("Party A", ["Alice"]);
    expect(await candidateRegistry.getParty(1)).to.equal("Party A");
  });

  it("empty names array is rejected", async function () {
    await expect(
      candidateRegistry.connect(registrar).addCandidate("P", [])
    ).to.be.revertedWith("Empty list");
  });

  // ── removeCandidate ─────────────────────────────────────────────────────────

  it("registrar can remove an existing candidate", async function () {
    await candidateRegistry.connect(registrar).addCandidate("Party A", ["Alice"]);
    await candidateRegistry.connect(registrar).removeCandidate(1);
    expect(await candidateRegistry.getParty(1)).to.equal(""); // deleted
  });

  it("removing a non-existent candidate reverts", async function () {
    await expect(
      candidateRegistry.connect(registrar).removeCandidate(999)
    ).to.be.revertedWith("Not found");
  });

  it("stranger cannot removeCandidate", async function () {
    await candidateRegistry.connect(registrar).addCandidate("Party A", ["Alice"]);
    await expect(
      candidateRegistry.connect(stranger).removeCandidate(1)
    ).to.be.revertedWith("Not authorized");
  });

  it("CandidateRemoved event is emitted", async function () {
    await candidateRegistry.connect(registrar).addCandidate("P", ["A"]);
    await expect(
      candidateRegistry.connect(registrar).removeCandidate(1)
    ).to.emit(candidateRegistry, "CandidateRemoved");
  });

  // ── snapshot ────────────────────────────────────────────────────────────────

  it("snapshot records all current candidate ids for the election", async function () {
    await candidateRegistry.connect(registrar).addCandidate("Party A", ["Alice"]);
    await candidateRegistry.connect(registrar).addCandidate("Party B", ["Bob"]);
    await candidateRegistry.connect(registrar).snapshot(electionId);

    const ids = await candidateRegistry.getCandidates(electionId);
    expect(ids.length).to.equal(2);
    expect(ids[0]).to.equal(1n);
    expect(ids[1]).to.equal(2n);
  });

  it("snapshot after removeCandidate does not include removed candidate", async function () {
    await candidateRegistry.connect(registrar).addCandidate("P1", ["Alice"]);
    await candidateRegistry.connect(registrar).addCandidate("P2", ["Bob"]);
    await candidateRegistry.connect(registrar).removeCandidate(1);
    await candidateRegistry.connect(registrar).snapshot(electionId);

    const ids = await candidateRegistry.getCandidates(electionId);
    expect(ids.length).to.equal(1);
    expect(ids[0]).to.equal(2n);
  });

  it("snapshotting same election twice reverts", async function () {
    await candidateRegistry.connect(registrar).addCandidate("P", ["A"]);
    await candidateRegistry.connect(registrar).snapshot(electionId);
    await expect(
      candidateRegistry.connect(registrar).snapshot(electionId)
    ).to.be.revertedWith("Already snapshotted");
  });

  it("stranger cannot call snapshot", async function () {
    await expect(
      candidateRegistry.connect(stranger).snapshot(electionId)
    ).to.be.revertedWith("Not authorized");
  });

  it("getCandidates returns empty array for unseen electionId", async function () {
    const ids = await candidateRegistry.getCandidates(42);
    expect(ids.length).to.equal(0);
  });
});
