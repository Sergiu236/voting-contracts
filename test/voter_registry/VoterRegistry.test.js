const { expect } = require("chai");
const { ethers } = require("hardhat");

// ─── Merkle helpers (mirror of VoterRegistry.verifyProof) ────────────────────
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

describe("VoterRegistry", function () {
  let owner, registrar, stranger;
  let rbac, auditTrail, voterRegistry;

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

    voterRegistry = await (await ethers.getContractFactory("VoterRegistry"))
      .deploy(await rbacProxy.getAddress(), await auditTrail.getAddress());
    await voterRegistry.waitForDeployment();

    // Human registrar
    const REGISTRAR = await rbac.REGISTRAR_ROLE();
    await rbac.assignRole(REGISTRAR, registrar.address);
    // VoterRegistry calls logAction in snapshot() → needs role in AuditTrail
    await rbac.assignRole(REGISTRAR, await voterRegistry.getAddress());
  });

  // ── snapshot ──────────────────────────────────────────────────────────────

  it("registrar can snapshot a Merkle root for an election", async function () {
    const voterHash = ethers.keccak256(ethers.toUtf8Bytes("voter"));
    const { root } = buildTree(voterHash);
    await expect(voterRegistry.connect(registrar).snapshot(electionId, root))
      .to.emit(voterRegistry, "SnapshotTaken")
      .withArgs(electionId, root, (await ethers.provider.getBlock("latest")).timestamp + 1);
    expect(await voterRegistry.getSnapshot(electionId)).to.equal(root);
  });

  it("snapshotting the same election twice reverts", async function () {
    const voterHash = ethers.keccak256(ethers.toUtf8Bytes("v"));
    const { root } = buildTree(voterHash);
    await voterRegistry.connect(registrar).snapshot(electionId, root);
    await expect(
      voterRegistry.connect(registrar).snapshot(electionId, root)
    ).to.be.revertedWith("Already snapshotted");
  });

  it("stranger cannot snapshot", async function () {
    const { root } = buildTree(ethers.keccak256(ethers.toUtf8Bytes("v")));
    await expect(
      voterRegistry.connect(stranger).snapshot(electionId, root)
    ).to.be.revertedWith("Not authorized");
  });

  it("getSnapshot returns zero bytes32 for unknown election", async function () {
    expect(await voterRegistry.getSnapshot(999)).to.equal(ethers.ZeroHash);
  });

  // ── vote ──────────────────────────────────────────────────────────────────

  it("eligible voter (index 0) can vote and Voted event is emitted", async function () {
    const voterHash = ethers.keccak256(ethers.toUtf8Bytes("voter"));
    const { root, leaf1 } = buildTree(voterHash);
    await voterRegistry.connect(registrar).snapshot(electionId, root);

    await expect(voterRegistry.vote(electionId, 0, voterHash, [leaf1]))
      .to.emit(voterRegistry, "Voted")
      .withArgs(electionId, 0, voterHash);
  });

  it("hasVoted returns true after a successful vote", async function () {
    const voterHash = ethers.keccak256(ethers.toUtf8Bytes("voter"));
    const { root, leaf1 } = buildTree(voterHash);
    await voterRegistry.connect(registrar).snapshot(electionId, root);
    await voterRegistry.vote(electionId, 0, voterHash, [leaf1]);
    expect(await voterRegistry.hasVoted(electionId, 0)).to.equal(true);
  });

  it("hasVoted returns false for voter that has not voted", async function () {
    expect(await voterRegistry.hasVoted(electionId, 0)).to.equal(false);
  });

  it("second vote with same index reverts with 'Already voted'", async function () {
    const voterHash = ethers.keccak256(ethers.toUtf8Bytes("voter"));
    const { root, leaf1 } = buildTree(voterHash);
    await voterRegistry.connect(registrar).snapshot(electionId, root);
    await voterRegistry.vote(electionId, 0, voterHash, [leaf1]);
    await expect(
      voterRegistry.vote(electionId, 0, voterHash, [leaf1])
    ).to.be.revertedWith("Already voted");
  });

  it("ineligible voter (bad proof) is rejected", async function () {
    const voterHash = ethers.keccak256(ethers.toUtf8Bytes("voter"));
    const { root } = buildTree(voterHash);
    await voterRegistry.connect(registrar).snapshot(electionId, root);

    const badProof = [ethers.keccak256(ethers.toUtf8Bytes("wrong"))];
    await expect(
      voterRegistry.vote(electionId, 0, voterHash, badProof)
    ).to.be.revertedWith("Not eligible");
  });

  it("voting before any snapshot reverts with 'No snapshot'", async function () {
    const voterHash = ethers.keccak256(ethers.toUtf8Bytes("voter"));
    await expect(
      voterRegistry.vote(electionId, 0, voterHash, [])
    ).to.be.revertedWith("No snapshot");
  });

  it("two voters at different indices can each vote independently", async function () {
    const hash0 = ethers.keccak256(ethers.toUtf8Bytes("voter-0"));
    const hash1 = ethers.keccak256(ethers.toUtf8Bytes("voter-1"));
    const leaf0 = makeLeaf(0, hash0);
    const leaf1 = makeLeaf(1, hash1);
    const root  = sortedHash(leaf0, leaf1);

    await voterRegistry.connect(registrar).snapshot(electionId, root);

    await voterRegistry.vote(electionId, 0, hash0, [leaf1]);
    await voterRegistry.vote(electionId, 1, hash1, [leaf0]);

    expect(await voterRegistry.hasVoted(electionId, 0)).to.equal(true);
    expect(await voterRegistry.hasVoted(electionId, 1)).to.equal(true);
  });

  // ── verifyProof (public view) ─────────────────────────────────────────────

  it("verifyProof returns true for a valid (index, voterHash) pair", async function () {
    const voterHash = ethers.keccak256(ethers.toUtf8Bytes("voter"));
    const { root, leaf1 } = buildTree(voterHash);
    await voterRegistry.connect(registrar).snapshot(electionId, root);

    const leaf0 = makeLeaf(0, voterHash);
    expect(await voterRegistry.verifyProof(electionId, leaf0, [leaf1])).to.equal(true);
  });

  it("verifyProof returns false for a tampered voterHash", async function () {
    const voterHash = ethers.keccak256(ethers.toUtf8Bytes("voter"));
    const { root, leaf1 } = buildTree(voterHash);
    await voterRegistry.connect(registrar).snapshot(electionId, root);

    const tamperedLeaf = makeLeaf(0, ethers.keccak256(ethers.toUtf8Bytes("tampered")));
    expect(await voterRegistry.verifyProof(electionId, tamperedLeaf, [leaf1])).to.equal(false);
  });
});
