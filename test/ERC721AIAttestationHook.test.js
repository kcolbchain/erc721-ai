import { expect } from "chai";
import { ethers } from "hardhat";

describe("ERC721AIAttestationHook", function () {
  let hook, mockVerifier;
  let owner, other, verifierAddr;

  const ATTESTATION_KIND = ethers.encodeBytes32String("zk-tee");

  beforeEach(async function () {
    [owner, other] = await ethers.getSigners();

    const MockVerifier = await ethers.getContractFactory("MockTrainingAttestationVerifier");
    mockVerifier = await MockVerifier.deploy();
    await mockVerifier.waitForDeployment();
    verifierAddr = await mockVerifier.getAddress();

    const Hook = await ethers.getContractFactory("ERC721AIAttestationHook");
    hook = await Hook.deploy(owner.address);
    await hook.waitForDeployment();
  });

  describe("Deployment", function () {
    it("sets owner on deploy", async function () {
      expect(await hook.owner()).to.equal(owner.address);
    });
  });

  describe("setAttestationVerifier", function () {
    it("configures a verifier for an attestation kind", async function () {
      await expect(hook.setAttestationVerifier(ATTESTATION_KIND, verifierAddr))
        .to.emit(hook, "AttestationVerifierConfigured")
        .withArgs(ATTESTATION_KIND, verifierAddr);
      expect(await hook.attestationVerifiers(ATTESTATION_KIND)).to.equal(verifierAddr);
    });

    it("reverts when called by non-owner", async function () {
      await expect(
        hook.connect(other).setAttestationVerifier(ATTESTATION_KIND, verifierAddr)
      ).to.be.revertedWithCustomError(hook, "NotOwner");
    });

    it("reverts with zero address verifier", async function () {
      await expect(
        hook.setAttestationVerifier(ATTESTATION_KIND, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(hook, "ZeroAddressVerifier");
    });
  });

  describe("registerAndVerifyAttestation", function () {
    const tokenId = 1;
    const modelId = ethers.encodeBytes32String("model-1");
    const artifactHash = ethers.encodeBytes32String("artifact-1");
    const attestationData = ethers.toUtf8Bytes("test-attestation");

    beforeEach(async function () {
      await hook.setAttestationVerifier(ATTESTATION_KIND, verifierAddr);
    });

    it("registers a verified attestation", async function () {
      await mockVerifier.setApproval(modelId, artifactHash, attestationData, true);
      await expect(
        hook.registerAndVerifyAttestation(tokenId, modelId, artifactHash, ATTESTATION_KIND, attestationData)
      ).to.emit(hook, "TrainingAttestationVerified");
      const att = await hook.attestationsByTokenId(tokenId);
      expect(att.modelId).to.equal(modelId);
      expect(att.artifactHash).to.equal(artifactHash);
      expect(att.verifier).to.equal(verifierAddr);
    });

    it("reverts when verifier not configured", async function () {
      const unknownKind = ethers.encodeBytes32String("unknown");
      await expect(
        hook.registerAndVerifyAttestation(tokenId, modelId, artifactHash, unknownKind, attestationData)
      ).to.be.revertedWithCustomError(hook, "MissingVerifier");
    });

    it("reverts when verification fails", async function () {
      await expect(
        hook.registerAndVerifyAttestation(tokenId, modelId, artifactHash, ATTESTATION_KIND, attestationData)
      ).to.be.revertedWithCustomError(hook, "AttestationVerificationFailed");
    });

    it("works with acceptAll mode", async function () {
      await mockVerifier.setAcceptAll(true);
      await expect(
        hook.registerAndVerifyAttestation(tokenId, modelId, artifactHash, ATTESTATION_KIND, attestationData)
      ).to.emit(hook, "TrainingAttestationVerified");
    });

    it("stores correct attestation hash", async function () {
      await mockVerifier.setAcceptAll(true);
      await hook.registerAndVerifyAttestation(tokenId, modelId, artifactHash, ATTESTATION_KIND, attestationData);
      const att = await hook.attestationsByTokenId(tokenId);
      expect(att.attestationHash).to.equal(ethers.keccak256(attestationData));
    });

    it("allows overwriting attestation for same token", async function () {
      await mockVerifier.setAcceptAll(true);
      await hook.registerAndVerifyAttestation(tokenId, modelId, artifactHash, ATTESTATION_KIND, attestationData);
      const newData = ethers.toUtf8Bytes("updated");
      await hook.registerAndVerifyAttestation(tokenId, modelId, artifactHash, ATTESTATION_KIND, newData);
      const att = await hook.attestationsByTokenId(tokenId);
      expect(att.attestationHash).to.equal(ethers.keccak256(newData));
    });

    it("anyone can register if verifier configured", async function () {
      await mockVerifier.setAcceptAll(true);
      await expect(
        hook.connect(other).registerAndVerifyAttestation(1, modelId, artifactHash, ATTESTATION_KIND, attestationData)
      ).to.emit(hook, "TrainingAttestationVerified");
    });
  });
});
