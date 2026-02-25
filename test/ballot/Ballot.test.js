const { expect } = require("chai");
const { ethers } = require("hardhat");

// ─── Merkle helpers ──────────────────────────────────────────────────────────
// Matches the exact algorithm in VoterRegistry.verifyProof().
function makeLeaf(index, voterHash) {
  return ethers.keccak256(ethers.solidityPacked(["uint256", "bytes32"], [index, voterHash]));
}
function sortedHash(a, b) {
  return BigInt(a) <= BigInt(b)
    ? ethers.keccak256(ethers.concat([a, b]))
    : ethers.keccak256(ethers.concat([b, a]));
}
// Build a 2-leaf Merkle tree for voter at index 0.
// Returns { root, proof } ready to pass into castVote / vote.
function buildTree(voterHash) {
  const leaf0 = makeLeaf(0, voterHash);
  const leaf1 = makeLeaf(1, voterHash); // dummy second leaf
  const root  = sortedHash(leaf0, leaf1);
  return { root, proof: [leaf1] };
}

describe("Ballot", function () {
  let owner, registrar, voter, stranger;
  let rbac, auditTrail, voterRegistry, candidateRegistry, ballot;

  const electionId = 1;
  const CANDIDATE_ID = 1; // first candidate auto-assigned id

  beforeEach(async function () {
    [owner, registrar, voter, stranger] = await ethers.getSigners();

    // ── RBAC ──
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

    // ── Supporting contracts ──
    auditTrail = await (await ethers.getContractFactory("AuditTrail"))
      .deploy(await rbacProxy.getAddress());
    await auditTrail.waitForDeployment();

    voterRegistry = await (await ethers.getContractFactory("VoterRegistry"))
      .deploy(await rbacProxy.getAddress(), await auditTrail.getAddress());
    await voterRegistry.waitForDeployment();

    candidateRegistry = await (await ethers.getContractFactory("CandidateRegistry"))
      .deploy(await rbacProxy.getAddress(), await auditTrail.getAddress());
    await candidateRegistry.waitForDeployment();

    ballot = await (await ethers.getContractFactory("Ballot")).deploy(
      electionId,
      await rbacProxy.getAddress(),
      await voterRegistry.getAddress(),
      await candidateRegistry.getAddress(),
      await auditTrail.getAddress(),
      ethers.ZeroAddress  // no incremental aggregation in unit tests
    );
    await ballot.waitForDeployment();

    // ── Role grants ──
    // Human roles
    const REGISTRAR = await rbac.REGISTRAR_ROLE();
    const AUDITOR   = await rbac.AUDITOR_ROLE();
    await rbac.assignRole(REGISTRAR, registrar.address);
    // Contract roles:
    //  VoterRegistry & CandidateRegistry call logAction → need REGISTRAR
    //  Ballot calls logAction (open/close/castVote) → need AUDITOR
    await rbac.assignRole(REGISTRAR, await voterRegistry.getAddress());
    await rbac.assignRole(REGISTRAR, await candidateRegistry.getAddress());
    await rbac.assignRole(AUDITOR,   await ballot.getAddress());

    // ── Seed data ──
    await candidateRegistry.connect(registrar).addCandidate("Party A", ["Alice"]);
    await candidateRegistry.connect(registrar).snapshot(electionId);
  });

  // ── open / close ──────────────────────────────────────────────────────────

  it("registrar can open a ballot and BallotOpened is emitted", async function () {
    await expect(ballot.connect(registrar).open()).to.emit(ballot, "BallotOpened");
    expect(await ballot.isOpen()).to.equal(true);
  });

  it("registrar can close an open ballot and BallotClosed is emitted", async function () {
    await ballot.connect(registrar).open();
    await expect(ballot.connect(registrar).close()).to.emit(ballot, "BallotClosed");
    expect(await ballot.isOpen()).to.equal(false);
  });

  it("stranger cannot open a ballot", async function () {
    await expect(ballot.connect(stranger).open()).to.be.revertedWith("Not authorized");
  });

  it("stranger cannot close a ballot", async function () {
    await ballot.connect(registrar).open();
    await expect(ballot.connect(stranger).close()).to.be.revertedWith("Not authorized");
  });

  it("admin (owner) can also open and close", async function () {
    await expect(ballot.connect(owner).open()).to.emit(ballot, "BallotOpened");
    await expect(ballot.connect(owner).close()).to.emit(ballot, "BallotClosed");
  });

  // ── castVote — happy path ─────────────────────────────────────────────────

  it("happy path: open → snapshot → vote → tally increments", async function () {
    await ballot.connect(registrar).open();

    const voterHash = ethers.keccak256(ethers.toUtf8Bytes("voter-alice"));
    const { root, proof } = buildTree(voterHash);
    await voterRegistry.connect(registrar).snapshot(electionId, root);

    await expect(ballot.connect(voter).castVote(0, voterHash, proof, CANDIDATE_ID))
      .to.emit(ballot, "VoteCast")
      .withArgs(voter.address, CANDIDATE_ID);

    expect(await ballot.getVoteCount(CANDIDATE_ID)).to.equal(1);
  });

  it("two different voters each cast one vote — tally = 2", async function () {
    await ballot.connect(registrar).open();

    // voter 0
    const hash0 = ethers.keccak256(ethers.toUtf8Bytes("voter-0"));
    const leaf0  = makeLeaf(0, hash0);
    // voter 1
    const hash1  = ethers.keccak256(ethers.toUtf8Bytes("voter-1"));
    const leaf1  = makeLeaf(1, hash1);
    const root   = sortedHash(leaf0, leaf1);

    await voterRegistry.connect(registrar).snapshot(electionId, root);

    await ballot.connect(voter).castVote(0, hash0, [leaf1], CANDIDATE_ID);
    await ballot.connect(stranger).castVote(1, hash1, [leaf0], CANDIDATE_ID);

    expect(await ballot.getVoteCount(CANDIDATE_ID)).to.equal(2);
  });

  it("VoteCast event contains correct voter address and candidateId", async function () {
    await ballot.connect(registrar).open();
    const voterHash = ethers.keccak256(ethers.toUtf8Bytes("v"));
    const { root, proof } = buildTree(voterHash);
    await voterRegistry.connect(registrar).snapshot(electionId, root);

    await expect(ballot.connect(voter).castVote(0, voterHash, proof, CANDIDATE_ID))
      .to.emit(ballot, "VoteCast")
      .withArgs(voter.address, CANDIDATE_ID);
  });

  // ── castVote — rejection cases ────────────────────────────────────────────

  it("reverts when ballot is closed", async function () {
    const voterHash = ethers.keccak256(ethers.toUtf8Bytes("voter"));
    await expect(
      ballot.castVote(0, voterHash, [], CANDIDATE_ID)
    ).to.be.revertedWith("Ballot closed");
  });

  it("reverts when voter submits an invalid Merkle proof", async function () {
    await ballot.connect(registrar).open();
    const voterHash = ethers.keccak256(ethers.toUtf8Bytes("voter"));
    const { root }  = buildTree(voterHash);
    await voterRegistry.connect(registrar).snapshot(electionId, root);

    const badProof = [ethers.keccak256(ethers.toUtf8Bytes("wrong"))];
    await expect(
      ballot.castVote(0, voterHash, badProof, CANDIDATE_ID)
    ).to.be.revertedWith("Not eligible");
  });

  it("reverts on double vote by same voter index", async function () {
    await ballot.connect(registrar).open();
    const voterHash = ethers.keccak256(ethers.toUtf8Bytes("voter"));
    const { root, proof } = buildTree(voterHash);
    await voterRegistry.connect(registrar).snapshot(electionId, root);

    await ballot.castVote(0, voterHash, proof, CANDIDATE_ID);
    await expect(
      ballot.castVote(0, voterHash, proof, CANDIDATE_ID)
    ).to.be.revertedWith("Already voted");
  });

  it("reverts when candidateId is not in the election snapshot", async function () {
    await ballot.connect(registrar).open();
    const voterHash = ethers.keccak256(ethers.toUtf8Bytes("voter"));
    const { root, proof } = buildTree(voterHash);
    await voterRegistry.connect(registrar).snapshot(electionId, root);

    await expect(
      ballot.castVote(0, voterHash, proof, 999)
    ).to.be.revertedWith("Invalid candidate");
  });

  it("vote is rejected if voter snapshot not taken yet", async function () {
    await ballot.connect(registrar).open();
    const voterHash = ethers.keccak256(ethers.toUtf8Bytes("voter"));
    // no snapshot called → root is zero → verifyProof reverts
    await expect(
      ballot.castVote(0, voterHash, [], CANDIDATE_ID)
    ).to.be.revertedWith("No snapshot");
  });

  // ── electionId ────────────────────────────────────────────────────────────

  it("electionId is immutable and readable", async function () {
    expect(await ballot.electionId()).to.equal(electionId);
  });
});