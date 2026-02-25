// test/voter_registry/VoterRegistry.simple.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VoterRegistry (simple)", function () {
  let owner;
  let registrar;

  let rbacLogic;
  let rbacProxy;
  let rbac;

  let auditTrail;
  let voterRegistry;

  const electionId = 1;

  beforeEach(async function () {
    [owner, registrar] = await ethers.getSigners();

    // deploy RBAC logic
    const RBACLogic = await ethers.getContractFactory(
      "contracts/access/RoleBasedAccess.sol:RoleBasedAccessLogicV1"
    );
    rbacLogic = await RBACLogic.deploy();
    await rbacLogic.waitForDeployment();

    // deploy RBAC proxy (owner is admin)
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

    // deploy AuditTrail
    const AuditTrail = await ethers.getContractFactory("AuditTrail");
    auditTrail = await AuditTrail.deploy(await rbacProxy.getAddress());
    await auditTrail.waitForDeployment();

    // deploy VoterRegistry
    const VoterRegistry = await ethers.getContractFactory("VoterRegistry");
    voterRegistry = await VoterRegistry.deploy(
      await rbacProxy.getAddress(),
      await auditTrail.getAddress()
    );
    await voterRegistry.waitForDeployment();
  });

  it("allows eligible voter to vote once", async function () {
    // fake voter data
    const voterIndex = 0;
    const voterHash = ethers.keccak256(ethers.toUtf8Bytes("voter"));

    // build 2-leaf merkle tree
    const leaf0 = ethers.keccak256(
      ethers.solidityPacked(["uint256", "bytes32"], [0, voterHash])
    );
    const leaf1 = ethers.keccak256(
      ethers.solidityPacked(["uint256", "bytes32"], [1, voterHash])
    );

    // sorted pair hash (same rule as contract)
    const root =
      BigInt(leaf0) < BigInt(leaf1)
        ? ethers.keccak256(ethers.concat([leaf0, leaf1]))
        : ethers.keccak256(ethers.concat([leaf1, leaf0]));

    // snapshot election
    await voterRegistry.connect(registrar).snapshot(electionId, root);

    // proof = sibling only (2-leaf tree)
    const proof = [leaf1];

    // vote should work
    await voterRegistry.vote(electionId, voterIndex, voterHash, proof);

    expect(await voterRegistry.hasVoted(electionId, voterIndex)).to.equal(true);

    // second vote should fail
    await expect(
      voterRegistry.vote(electionId, voterIndex, voterHash, proof)
    ).to.be.revertedWith("Already voted");
  });
});
