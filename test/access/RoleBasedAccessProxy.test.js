const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RoleBasedAccessProxy", function () {
  let owner, user1, user2, upgrader;
  let logicV1, logicV2, proxy, access;

  beforeEach(async function () {
    [owner, user1, user2, upgrader] = await ethers.getSigners();

    const LogicV1 = await ethers.getContractFactory(
      "contracts/access/RoleBasedAccess.sol:RoleBasedAccessLogicV1"
    );
    logicV1 = await LogicV1.deploy();
    await logicV1.waitForDeployment();

    const Proxy = await ethers.getContractFactory(
      "contracts/access/RoleBasedAccessProxy.sol:RoleBasedAccessProxy"
    );
    proxy = await Proxy.deploy(await logicV1.getAddress(), await owner.getAddress());
    await proxy.waitForDeployment();

    access = await ethers.getContractAt(
      "contracts/access/IRoleBasedAccess.sol:IRoleBasedAccess",
      await proxy.getAddress()
    );

    const LogicV2 = await ethers.getContractFactory(
      "contracts/access/RoleBasedAccess.sol:RoleBasedAccessLogicV1"
    );
    logicV2 = await LogicV2.deploy();
    await logicV2.waitForDeployment();
  });

  // ── Initialization ────────────────────────────────────────────────────────

  it("proxy constructor grants DEFAULT_ADMIN_ROLE to deployer", async function () {
    const adminRole = await access.DEFAULT_ADMIN_ROLE();
    expect(await access.hasRole(adminRole, owner.address)).to.equal(true);
  });

  it("non-admin does NOT have DEFAULT_ADMIN_ROLE by default", async function () {
    const adminRole = await access.DEFAULT_ADMIN_ROLE();
    expect(await access.hasRole(adminRole, user1.address)).to.equal(false);
  });

  // ── assignRole ────────────────────────────────────────────────────────────

  it("admin can assign REGISTRAR_ROLE to a user", async function () {
    const role = await access.REGISTRAR_ROLE();
    await access.assignRole(role, user1.address);
    expect(await access.hasRole(role, user1.address)).to.equal(true);
  });

  it("admin can assign AUDITOR_ROLE to a user", async function () {
    const role = await access.AUDITOR_ROLE();
    await access.assignRole(role, user1.address);
    expect(await access.hasRole(role, user1.address)).to.equal(true);
  });

  it("assigning a role twice does not revert and keeps role set", async function () {
    const role = await access.REGISTRAR_ROLE();
    await access.assignRole(role, user1.address);
    await access.assignRole(role, user1.address); // idempotent
    expect(await access.hasRole(role, user1.address)).to.equal(true);
  });

  it("non-admin cannot assignRole — reverts with 'Not admin'", async function () {
    const role = await access.REGISTRAR_ROLE();
    await expect(
      access.connect(user1).assignRole(role, user2.address)
    ).to.be.revertedWith("Not admin");
  });

  it("registrar cannot assign roles to others", async function () {
    const registrarRole = await access.REGISTRAR_ROLE();
    await access.assignRole(registrarRole, user1.address);
    await expect(
      access.connect(user1).assignRole(registrarRole, user2.address)
    ).to.be.revertedWith("Not admin");
  });

  // ── deleteRole ────────────────────────────────────────────────────────────

  it("admin can revoke a previously assigned role", async function () {
    const role = await access.AUDITOR_ROLE();
    await access.assignRole(role, user1.address);
    await access.deleteRole(role, user1.address);
    expect(await access.hasRole(role, user1.address)).to.equal(false);
  });

  it("deleting a role that was never assigned does not revert", async function () {
    const role = await access.AUDITOR_ROLE();
    await access.deleteRole(role, user1.address); // should not revert
    expect(await access.hasRole(role, user1.address)).to.equal(false);
  });

  it("non-admin cannot deleteRole — reverts with 'Not admin'", async function () {
    const role = await access.AUDITOR_ROLE();
    await access.assignRole(role, user1.address);
    await expect(
      access.connect(user1).deleteRole(role, user1.address)
    ).to.be.revertedWith("Not admin");
  });

  // ── upgradeTo ─────────────────────────────────────────────────────────────

  it("non-upgrader cannot call upgradeTo — reverts with 'Not upgrader'", async function () {
    await expect(
      proxy.connect(user1).upgradeTo(await logicV2.getAddress())
    ).to.be.revertedWith("Not upgrader");
  });

  it("user with UPGRADER_ROLE can upgrade and Upgraded event is emitted", async function () {
    const upgraderRole = await access.UPGRADER_ROLE();
    await access.assignRole(upgraderRole, upgrader.address);
    await expect(
      proxy.connect(upgrader).upgradeTo(await logicV2.getAddress())
    ).to.emit(proxy, "Upgraded");
  });

  it("after upgrade, role state is preserved (storage in proxy)", async function () {
    const registrarRole = await access.REGISTRAR_ROLE();
    const upgraderRole  = await access.UPGRADER_ROLE();

    await access.assignRole(registrarRole, user1.address);
    await access.assignRole(upgraderRole,  upgrader.address);

    await proxy.connect(upgrader).upgradeTo(await logicV2.getAddress());

    // roles must still be set — storage lives in proxy, not in logic
    expect(await access.hasRole(registrarRole, user1.address)).to.equal(true);
    expect(await access.hasRole(upgraderRole,  upgrader.address)).to.equal(true);
  });
});
