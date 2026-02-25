const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Ballot (real flow)", function () {
  let owner;
  let registrar;
  let user;

  let rbacLogic;
  let rbacProxy;
  let rbac;

  let auditTrail;
  let voterRegistry;
  let candidateRegistry;
  let ballot;

  const electionId = 1;

  beforeEach(async function () {
    [owner, registrar, user] = await ethers.getSigners();

    // RBAC logic
    const RBACLogic = await ethers.getContractFactory(
      "contracts/access/RoleBasedAccess.sol:RoleBasedAccessLogicV1"
    );
    rbacLogic = await RBACLogic.deploy();
    await rbacLogic.waitForDeployment();

    // RBAC proxy
    const RBACProxy = await ethers.getContractFactory(
      "contracts/access/RoleBasedAccessProxy.sol:RoleBasedAccessProxy"
    );
    rbacProxy = await RBACProxy.deploy(
      await rbacLogic.getAddress(),
      await owner.getAddress()
    );
    await rbacProxy.waitForDeployment();

    rbac = await ethers.getContractAt(
      "contracts/access/IRoleBasedAccess.sol:IRoleBasedAccess",
      await rbacProxy.getAddress()
    );

    // give registrar role
    const registrarRole = await rbac.REGISTRAR_ROLE();
    await rbac.assignRole(registrarRole, await registrar.getAddress());

    // AuditTrail
    const AuditTrail = await ethers.getContractFactory("AuditTrail");
    auditTrail = await AuditTrail.deploy(await rbacProxy.getAddress());
    await auditTrail.waitForDeployment();

    // VoterRegistry
    const VoterRegistry = await ethers.getContractFactory("VoterRegistry");
    voterRegistry = await VoterRegistry.deploy(
      await rbacProxy.getAddress(),
      await auditTrail.getAddress()
    );
    await voterRegistry.waitForDeployment();

    // CandidateRegistry
    const CandidateRegistry = await ethers.getContractFactory("CandidateRegistry");
    candidateRegistry = await CandidateRegistry.deploy(
      await rbacProxy.getAddress(),
      await auditTrail.getAddress()
    );
    await candidateRegistry.waitForDeployment();

    // add candidate
    await candidateRegistry
      .connect(registrar)
      .addCandidate("Party A", ["Alice"]);

    // snapshot candidates
    await candidateRegistry.connect(registrar).snapshot(electionId);

    // Ballot
    const Ballot = await ethers.getContractFactory("Ballot");
    ballot = await Ballot.deploy(
      electionId,
      await rbacProxy.getAddress(),
      await voterRegistry.getAddress(),
      await candidateRegistry.getAddress(),
      await auditTrail.getAddress()
    );
    await ballot.waitForDeployment();
  });

  it("happy path: open → vote → count", async function () {
    // open ballot
    await ballot.connect(registrar).open();

    // voter data
    const voterIndex = 0;
    const voterHash = ethers.keccak256(ethers.toUtf8Bytes("voter"));

    // minimal merkle tree (2 leaves)
    const leaf0 = ethers.keccak256(
      ethers.solidityPacked(["uint256", "bytes32"], [0, voterHash])
    );
    const leaf1 = ethers.keccak256(
      ethers.solidityPacked(["uint256", "bytes32"], [1, voterHash])
    );

    const root =
      BigInt(leaf0) < BigInt(leaf1)
        ? ethers.keccak256(ethers.concat([leaf0, leaf1]))
        : ethers.keccak256(ethers.concat([leaf1, leaf0]));

    // snapshot voters
    await voterRegistry.connect(registrar).snapshot(electionId, root);

    const proof = [leaf1];

    // vote for candidate 1
    await ballot.castVote(
      voterIndex,
      voterHash,
      proof,
      1
    );

    expect(await ballot.getVoteCount(1)).to.equal(1);
  });

  it("rejects invalid candidate (real flow)", async function () {
    await ballot.connect(registrar).open();

    const voterIndex = 0;
    const voterHash = ethers.keccak256(ethers.toUtf8Bytes("voter"));

    const leaf0 = ethers.keccak256(
      ethers.solidityPacked(["uint256", "bytes32"], [0, voterHash])
    );
    const leaf1 = ethers.keccak256(
      ethers.solidityPacked(["uint256", "bytes32"], [1, voterHash])
    );

    const root =
      BigInt(leaf0) < BigInt(leaf1)
        ? ethers.keccak256(ethers.concat([leaf0, leaf1]))
        : ethers.keccak256(ethers.concat([leaf1, leaf0]));

    // snapshot voters
    await voterRegistry.connect(registrar).snapshot(electionId, root);

    const proof = [leaf1];

    // invalid candidate id
    await expect(
      ballot.castVote(
        voterIndex,
        voterHash,
        proof,
        999
      )
    ).to.be.revertedWith("Invalid candidate");
  });

  it("rejects voting when ballot is closed", async function () {
    const voterHash = ethers.keccak256(ethers.toUtf8Bytes("voter"));

    await expect(
      ballot.castVote(0, voterHash, [], 1)
    ).to.be.revertedWith("Ballot closed");
  });
});