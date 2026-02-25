const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("AuditTrail", function () {
  let owner, registrar, auditor, stranger;
  let rbac, auditTrail;

  beforeEach(async function () {
    [owner, registrar, auditor, stranger] = await ethers.getSigners();

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

    await rbac.assignRole(await rbac.REGISTRAR_ROLE(), registrar.address);
    await rbac.assignRole(await rbac.AUDITOR_ROLE(),   auditor.address);
  });

  // ── Authorization ───────────────────────────────────────────────────────────

  it("registrar can logAction", async function () {
    const code  = ethers.encodeBytes32String("REG_ACTION");
    const refId = ethers.encodeBytes32String("REF_1");
    await expect(auditTrail.connect(registrar).logAction(code, refId))
      .to.emit(auditTrail, "SystemAction");
  });

  it("auditor can logAction", async function () {
    const code  = ethers.encodeBytes32String("AUDIT_LOG");
    const refId = ethers.encodeBytes32String("REF_2");
    await expect(auditTrail.connect(auditor).logAction(code, refId))
      .to.emit(auditTrail, "SystemAction");
  });

  it("admin (owner) can logAction", async function () {
    const code  = ethers.encodeBytes32String("ADMIN_LOG");
    const refId = ethers.encodeBytes32String("REF_3");
    await expect(auditTrail.connect(owner).logAction(code, refId))
      .to.emit(auditTrail, "SystemAction");
  });

  it("account with no role cannot logAction — reverts 'Not authorized to log'", async function () {
    const code  = ethers.encodeBytes32String("BAD");
    const refId = ethers.encodeBytes32String("0");
    await expect(
      auditTrail.connect(stranger).logAction(code, refId)
    ).to.be.revertedWith("Not authorized to log");
  });

  it("revoking AUDITOR_ROLE blocks future logging", async function () {
    const code  = ethers.encodeBytes32String("REVOKE_TEST");
    const refId = ethers.encodeBytes32String("0");

    await auditTrail.connect(auditor).logAction(code, refId); // still works

    await rbac.deleteRole(await rbac.AUDITOR_ROLE(), auditor.address);

    await expect(
      auditTrail.connect(auditor).logAction(code, refId)
    ).to.be.revertedWith("Not authorized to log");
  });

  // ── SystemAction event contents ─────────────────────────────────────────────

  it("SystemAction event records caller, tx.origin, actionCode, refId", async function () {
    const code  = ethers.encodeBytes32String("SNAPSHOT");
    const refId = ethers.encodeBytes32String("ELECTION_42");

    // For an EOA call: caller == tx.origin == registrar.address
    await expect(auditTrail.connect(registrar).logAction(code, refId))
      .to.emit(auditTrail, "SystemAction")
      .withArgs(
        registrar.address, // caller  (msg.sender)
        registrar.address, // actor   (tx.origin — same as msg.sender for direct EOA call)
        code,
        refId,
        anyValue           // block.timestamp
      );
  });

  it("rbacProxy address is stored and publicly readable", async function () {
    expect(await auditTrail.rbacProxy()).to.not.equal(ethers.ZeroAddress);
  });
});
