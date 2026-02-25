const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RoleBasedAccessProxy", function () {
  let owner;
  let user1;
  let upgrader;

  let logicV1;
  let logicV2;
  let proxy;
  let access; // IRoleBasedAccess at proxy address

  beforeEach(async function () {
    [owner, user1, upgrader] = await ethers.getSigners();

    // Deploy logic v1
    const LogicV1 = await ethers.getContractFactory(
      "contracts/access/RoleBasedAccess.sol:RoleBasedAccessLogicV1"
    );
    logicV1 = await LogicV1.deploy();
    await logicV1.waitForDeployment();

    // Deploy proxy and initialize(admin) via delegatecall in constructor
    const Proxy = await ethers.getContractFactory(
      "contracts/access/RoleBasedAccessProxy.sol:RoleBasedAccessProxy"
    );

    proxy = await Proxy.deploy(
      await logicV1.getAddress(),
      await owner.getAddress()
    );
    await proxy.waitForDeployment();

    // Use interface ABI to call role functions through proxy fallback
    access = await ethers.getContractAt(
      "contracts/access/IRoleBasedAccess.sol:IRoleBasedAccess",
      await proxy.getAddress()
    );

    // Deploy logic v2 (same code, just another instance for upgrade test)
    const LogicV2 = await ethers.getContractFactory(
      "contracts/access/RoleBasedAccess.sol:RoleBasedAccessLogicV1"
    );
    logicV2 = await LogicV2.deploy();
    await logicV2.waitForDeployment();
  });

  it("sets admin via initialize in proxy constructor", async function () {
    const adminRole = await access.DEFAULT_ADMIN_ROLE();
    const isAdmin = await access.hasRole(adminRole, await owner.getAddress());
    expect(isAdmin).to.equal(true);
  });

  it("admin can assignRole; non-admin cannot", async function () {
    const registrarRole = await access.REGISTRAR_ROLE();

    await access.assignRole(registrarRole, await user1.getAddress());
    expect(await access.hasRole(registrarRole, await user1.getAddress())).to.equal(true);

    await expect(
      access.connect(user1).assignRole(registrarRole, await user1.getAddress())
    ).to.be.revertedWith("Not admin");
  });

  it("admin can deleteRole", async function () {
    const auditorRole = await access.AUDITOR_ROLE();

    await access.assignRole(auditorRole, await user1.getAddress());
    expect(await access.hasRole(auditorRole, await user1.getAddress())).to.equal(true);

    await access.deleteRole(auditorRole, await user1.getAddress());
    expect(await access.hasRole(auditorRole, await user1.getAddress())).to.equal(false);
  });

  it("only UPGRADER_ROLE can upgradeTo", async function () {
    const upgraderRole = await access.UPGRADER_ROLE();

    // non-upgrader should fail
    await expect(
      proxy.connect(user1).upgradeTo(await logicV2.getAddress())
    ).to.be.revertedWith("Not upgrader");

    // admin assigns UPGRADER_ROLE
    await access.assignRole(upgraderRole, await upgrader.getAddress());
    expect(await access.hasRole(upgraderRole, await upgrader.getAddress())).to.equal(true);

    // upgrader can upgrade
    await expect(
      proxy.connect(upgrader).upgradeTo(await logicV2.getAddress())
    ).to.emit(proxy, "Upgraded");
  });
});
