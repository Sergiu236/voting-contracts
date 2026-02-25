const { expect } = require("chai");
const { ethers } = require("hardhat");

// ─── Merkle helpers (mirror of VoterRegistry.verifyProof) ───────────────────
function makeLeaf(index, voterHash) {
  return ethers.keccak256(ethers.solidityPacked(["uint256", "bytes32"], [index, voterHash]));
}
function sortedHash(a, b) {
  return BigInt(a) <= BigInt(b)
    ? ethers.keccak256(ethers.concat([a, b]))
    : ethers.keccak256(ethers.concat([b, a]));
}
function buildTree(voterHash) {
  const leaf0 = makeLeaf(0, voterHash);
  const leaf1 = makeLeaf(1, voterHash);
  return { root: sortedHash(leaf0, leaf1), leaf0, leaf1 };
}

describe("ElectionManager", function () {
  let owner, registrar, voter;
  let rbac, auditTrail, voterRegistry, candidateRegistry;
  let ballotFactory, tallyVerifier, electionManager;

  beforeEach(async function () {
    [owner, registrar, voter] = await ethers.getSigners();

    // ── RBAC ──────────────────────────────────────────────────────────────────
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

    // ── Core contracts ────────────────────────────────────────────────────────
    auditTrail = await (await ethers.getContractFactory("AuditTrail"))
      .deploy(await rbacProxy.getAddress());
    await auditTrail.waitForDeployment();

    voterRegistry = await (await ethers.getContractFactory("VoterRegistry"))
      .deploy(await rbacProxy.getAddress(), await auditTrail.getAddress());
    await voterRegistry.waitForDeployment();

    candidateRegistry = await (await ethers.getContractFactory("CandidateRegistry"))
      .deploy(await rbacProxy.getAddress(), await auditTrail.getAddress());
    await candidateRegistry.waitForDeployment();

    tallyVerifier = await (await ethers.getContractFactory("TallyVerifier")).deploy();
    await tallyVerifier.waitForDeployment();

    ballotFactory = await (await ethers.getContractFactory("BallotFactory")).deploy(
      await voterRegistry.getAddress(),
      await candidateRegistry.getAddress(),
      await rbacProxy.getAddress(),
      await auditTrail.getAddress()
    );
    await ballotFactory.waitForDeployment();

    electionManager = await (await ethers.getContractFactory("ElectionManager")).deploy(
      await ballotFactory.getAddress(),
      await tallyVerifier.getAddress(),
      await rbacProxy.getAddress()
    );
    await electionManager.waitForDeployment();

    // Wire ElectionManager into BallotFactory so deployed Ballot shards can
    // call incrementTotal (incremental aggregation).
    await ballotFactory.setElectionManager(await electionManager.getAddress());

    // ── Role grants ───────────────────────────────────────────────────────────
    const REGISTRAR = await rbac.REGISTRAR_ROLE();
    const AUDITOR   = await rbac.AUDITOR_ROLE();

    // Human roles
    await rbac.assignRole(REGISTRAR, registrar.address);

    // Contract roles:
    //  VoterRegistry & CandidateRegistry call logAction → need REGISTRAR
    await rbac.assignRole(REGISTRAR, await voterRegistry.getAddress());
    await rbac.assignRole(REGISTRAR, await candidateRegistry.getAddress());

    // ElectionManager calls ballot.open() / ballot.close()
    //   → Ballot._hasRegistrarOrAdmin(msg.sender) checks ElectionManager → needs REGISTRAR
    await rbac.assignRole(REGISTRAR, await electionManager.getAddress());
  });

  // Helper: creates election, grants ballot contracts AUDITOR_ROLE, returns electionId + ballot
  async function createAndGrantBallot(name, shardCount) {
    const AUDITOR = await rbac.AUDITOR_ROLE();
    const tx    = await electionManager.connect(owner).createElection(name, shardCount);
    await tx.wait();
    const electionId = await electionManager.getElectionState(1).then(() => 1n);

    // Grant AUDITOR_ROLE to every ballot so they can call auditTrail.logAction
    for (let i = 0; i < shardCount; i++) {
      const ballotAddr = await electionManager.getBallot(1, i);
      await rbac.assignRole(AUDITOR, ballotAddr);
    }
    return electionId;
  }

  // ── createElection ───────────────────────────────────────────────────────────

  it("only admin can createElection — non-admin reverts", async function () {
    await expect(
      electionManager.connect(registrar).createElection("Test", 1)
    ).to.be.revertedWith("Not authorized");
  });

  it("zero shardCount is rejected", async function () {
    await expect(
      electionManager.connect(owner).createElection("Test", 0)
    ).to.be.revertedWith("Invalid shard count");
  });

  it("createElection deploys the correct number of shard ballots", async function () {
    await electionManager.connect(owner).createElection("Election 1", 3);
    // All 3 shards must exist
    for (let i = 0; i < 3; i++) {
      expect(await electionManager.getBallot(1, i)).to.not.equal(ethers.ZeroAddress);
    }
  });

  it("newly created election is in Created state", async function () {
    await electionManager.connect(owner).createElection("E1", 1);
    // 0 = Created
    expect(await electionManager.getElectionState(1)).to.equal(0);
  });

  // ── startElection ────────────────────────────────────────────────────────────

  it("only admin can startElection", async function () {
    await electionManager.connect(owner).createElection("E1", 1);
    const AUDITOR = await rbac.AUDITOR_ROLE();
    await rbac.assignRole(AUDITOR, await electionManager.getBallot(1, 0));

    await expect(
      electionManager.connect(registrar).startElection(1)
    ).to.be.revertedWith("Not authorized");
  });

  it("startElection from wrong state reverts with 'Wrong state'", async function () {
    await electionManager.connect(owner).createElection("E1", 1);
    const AUDITOR = await rbac.AUDITOR_ROLE();
    await rbac.assignRole(AUDITOR, await electionManager.getBallot(1, 0));

    await electionManager.connect(owner).startElection(1); // → Live
    await expect(
      electionManager.connect(owner).startElection(1)      // already Live
    ).to.be.revertedWith("Wrong state");
  });

  it("startElection transitions state from Created to Live", async function () {
    await createAndGrantBallot("E1", 1);
    await electionManager.connect(owner).startElection(1);
    // 1 = Live
    expect(await electionManager.getElectionState(1)).to.equal(1);
  });

  it("startElection opens all shard ballots", async function () {
    await createAndGrantBallot("E1", 2);
    await electionManager.connect(owner).startElection(1);

    for (let i = 0; i < 2; i++) {
      const ballotAddr = await electionManager.getBallot(1, i);
      const ballot = await ethers.getContractAt("Ballot", ballotAddr);
      expect(await ballot.isOpen()).to.equal(true);
    }
  });

  // ── finalizeElection ─────────────────────────────────────────────────────────

  it("only admin can finalizeElection", async function () {
    await createAndGrantBallot("E1", 1);
    await electionManager.connect(owner).startElection(1);

    await expect(
      electionManager.connect(registrar).finalizeElection(1, "0x", "0x")
    ).to.be.revertedWith("Not authorized");
  });

  it("finalizeElection before Live state reverts with 'Election not live'", async function () {
    await createAndGrantBallot("E1", 1);
    // still Created
    await expect(
      electionManager.connect(owner).finalizeElection(1, "0x", "0x")
    ).to.be.revertedWith("Election not live");
  });

  it("finalizeElection transitions state from Live to Finalized", async function () {
    await createAndGrantBallot("E1", 1);
    await electionManager.connect(owner).startElection(1);
    await electionManager.connect(owner).finalizeElection(1, "0x", "0x");
    // 2 = Finalized
    expect(await electionManager.getElectionState(1)).to.equal(2);
  });

  it("finalizeElection closes all shard ballots", async function () {
    await createAndGrantBallot("E1", 2);
    await electionManager.connect(owner).startElection(1);
    await electionManager.connect(owner).finalizeElection(1, "0x", "0x");

    for (let i = 0; i < 2; i++) {
      const ballotAddr = await electionManager.getBallot(1, i);
      const ballot = await ethers.getContractAt("Ballot", ballotAddr);
      expect(await ballot.isOpen()).to.equal(false);
    }
  });

  it("voting is rejected after finalizeElection closes the ballot", async function () {
    await createAndGrantBallot("E1", 1);
    await electionManager.connect(owner).startElection(1);
    await electionManager.connect(owner).finalizeElection(1, "0x", "0x");

    const ballotAddr = await electionManager.getBallot(1, 0);
    const ballot = await ethers.getContractAt("Ballot", ballotAddr);
    await expect(
      ballot.castVote(0, ethers.keccak256(ethers.toUtf8Bytes("v")), [], 1)
    ).to.be.revertedWith("Ballot closed");
  });

  // ── Full E2E lifecycle ───────────────────────────────────────────────────────

  it("full lifecycle: create → setup → start → vote → finalize", async function () {
    // 1. Admin creates election with 1 shard
    await electionManager.connect(owner).createElection("Presidential 2026", 1);
    const ballotAddr = await electionManager.getBallot(1, 0);
    const ballot     = await ethers.getContractAt("Ballot", ballotAddr);

    // Grant ballot AUDITOR_ROLE so it can call logAction
    await rbac.assignRole(await rbac.AUDITOR_ROLE(), ballotAddr);

    // 2. Registrar adds candidates and snapshots them
    await candidateRegistry.connect(registrar).addCandidate("Party A", ["Alice"]);
    await candidateRegistry.connect(registrar).addCandidate("Party B", ["Bob"]);
    await candidateRegistry.connect(registrar).snapshot(1);

    // 3. Registrar builds voter Merkle tree and snapshots it
    const voterHash = ethers.keccak256(ethers.toUtf8Bytes("voter-alice-id"));
    const { root, leaf1 } = buildTree(voterHash);
    await voterRegistry.connect(registrar).snapshot(1, root);

    // 4. Admin starts election → all ballots open
    await electionManager.connect(owner).startElection(1);
    expect(await ballot.isOpen()).to.equal(true);

    // 5. Voter casts a valid vote for candidate 1 on shard 0
    await ballot.connect(voter).castVote(0, voterHash, [leaf1], 1);
    expect(await ballot.getVoteCount(1)).to.equal(1);

    // 6. Same voter cannot vote again
    await expect(
      ballot.connect(voter).castVote(0, voterHash, [leaf1], 1)
    ).to.be.revertedWith("Already voted");

    // 7. Admin finalizes → ballots close, tally verified by mock verifier
    await electionManager.connect(owner).finalizeElection(1, "0x", "0x");
    expect(await electionManager.getElectionState(1)).to.equal(2); // Finalized
    expect(await ballot.isOpen()).to.equal(false);

    // 8. No more votes accepted after finalization
    const voterHash2   = ethers.keccak256(ethers.toUtf8Bytes("voter-bob-id"));
    const { root: r2, leaf1: l2 } = buildTree(voterHash2);
    await expect(
      ballot.connect(voter).castVote(0, voterHash2, [l2], 2)
    ).to.be.revertedWith("Ballot closed");
  });
});
