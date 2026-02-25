const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CandidateRegistry (simple)", function () {
  let owner;
  let registrar;
  let user;

  let rbacLogic;
  let rbacProxy;
  let rbac;

  let auditTrail;
  let candidateRegistry;

  const electionId = 1;

  beforeEach(async function () {
    [owner, registrar, user] = await ethers.getSigners();

    // deploy RBAC logic
    const RBACLogic = await ethers.getContractFactory(
      "contracts/access/RoleBasedAccess.sol:RoleBasedAccessLogicV1"
    );
    rbacLogic = await RBACLogic.deploy();
    await rbacLogic.waitForDeployment();

    // deploy RBAC proxy
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

    // deploy CandidateRegistry
    const CandidateRegistry = await ethers.getContractFactory("CandidateRegistry");
    candidateRegistry = await CandidateRegistry.deploy(
      await rbacProxy.getAddress(),
      await auditTrail.getAddress()
    );
    await candidateRegistry.waitForDeployment();
  });

  it("registrar can add candidate and read data", async function () {
    const party = "Party A";
    const names = ["Alice", "Bob"];

    // add candidate
    await candidateRegistry.connect(registrar).addCandidate(party, names);

    // first candidate gets id = 1
    expect(await candidateRegistry.getParty(1)).to.equal(party);

    const storedNames = await candidateRegistry.getCandidateNames(1);
    expect(storedNames.length).to.equal(2);
    expect(storedNames[0]).to.equal("Alice");
    expect(storedNames[1]).to.equal("Bob");
  });

  it("non-registrar cannot add candidate", async function () {
    await expect(
      candidateRegistry.connect(user).addCandidate("X", ["Y"])
    ).to.be.revertedWith("Not authorized");
  });

  it("snapshot stores candidate ids for election", async function () {
    await candidateRegistry.connect(registrar).addCandidate("Party A", ["Alice"]);
    await candidateRegistry.connect(registrar).addCandidate("Party B", ["Bob"]);

    await candidateRegistry.connect(registrar).snapshot(electionId);

    const ids = await candidateRegistry.getCandidates(electionId);
    expect(ids.length).to.equal(2);
    expect(ids[0]).to.equal(1);
    expect(ids[1]).to.equal(2);
  });
});
