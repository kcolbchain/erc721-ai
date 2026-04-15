// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/ERC721AIAttestationHook.sol";
import "../contracts/mocks/MockTrainingAttestationVerifier.sol";

contract ERC721AIAttestationHookTest is Test {
    ERC721AIAttestationHook public hook;
    MockTrainingAttestationVerifier public mockVerifier;
    address public owner;
    address public other;
    bytes32 constant ATTESTATION_KIND = keccak256("zk-tee");

    function setUp() public {
        owner = address(this);
        other = makeAddr("other");

        mockVerifier = new MockTrainingAttestationVerifier();
        hook = new ERC721AIAttestationHook(owner);
    }

    // ── Deployment ──────────────────────────────────────────────────────

    function test_SetOwnerOnDeploy() public view {
        assertEq(hook.owner(), owner);
    }

    // ── setAttestationVerifier ─────────────────────────────────────────

    function test_ConfiguresVerifier() public {
        hook.setAttestationVerifier(ATTESTATION_KIND, address(mockVerifier));
        assertEq(hook.attestationVerifiers(ATTESTATION_KIND), address(mockVerifier));
    }

    function test_EmitsVerifierConfigured() public {
        vm.expectEmit(true, true, false, false);
        emit ERC721AIAttestationHook.AttestationVerifierConfigured(ATTESTATION_KIND, address(mockVerifier));
        hook.setAttestationVerifier(ATTESTATION_KIND, address(mockVerifier));
    }

    function test_RevertWhenNonOwnerSetsVerifier() public {
        vm.prank(other);
        vm.expectRevert(ERC721AIAttestationHook.NotOwner.selector);
        hook.setAttestationVerifier(ATTESTATION_KIND, address(mockVerifier));
    }

    function test_RevertWhenZeroAddressVerifier() public {
        vm.expectRevert(ERC721AIAttestationHook.ZeroAddressVerifier.selector);
        hook.setAttestationVerifier(ATTESTATION_KIND, address(0));
    }

    function test_CanUpdateExistingVerifier() public {
        hook.setAttestationVerifier(ATTESTATION_KIND, address(mockVerifier));
        hook.setAttestationVerifier(ATTESTATION_KIND, other);
        assertEq(hook.attestationVerifiers(ATTESTATION_KIND), other);
    }

    // ── registerAndVerifyAttestation ────────────────────────────────────

    function test_RegistersVerifiedAttestation() public {
        hook.setAttestationVerifier(ATTESTATION_KIND, address(mockVerifier));

        bytes32 modelId = keccak256("model-1");
        bytes32 artifactHash = keccak256("artifact-1");
        bytes memory attestationData = "test-attestation";

        mockVerifier.setApproval(modelId, artifactHash, attestationData, true);

        hook.registerAndVerifyAttestation(1, modelId, artifactHash, ATTESTATION_KIND, attestationData);

        (
            bytes32 storedModelId,
            bytes32 storedArtifactHash,
            bytes32 storedAttestationHash,
            bytes32 storedAttestationKind,
            address storedVerifier,
            uint64 storedVerifiedAt
        ) = hook.attestationsByTokenId(1);

        assertEq(storedModelId, modelId);
        assertEq(storedArtifactHash, artifactHash);
        assertEq(storedAttestationKind, ATTESTATION_KIND);
        assertEq(storedVerifier, address(mockVerifier));
        assertGt(storedVerifiedAt, 0);
        assertEq(storedAttestationHash, keccak256(attestationData));
    }

    function test_RevertWhenVerifierNotConfigured() public {
        bytes32 unknownKind = keccak256("unknown");
        vm.expectRevert(abi.encodeWithSelector(ERC721AIAttestationHook.MissingVerifier.selector, unknownKind));
        hook.registerAndVerifyAttestation(1, keccak256("m"), keccak256("a"), unknownKind, "data");
    }

    function test_RevertWhenVerificationFails() public {
        hook.setAttestationVerifier(ATTESTATION_KIND, address(mockVerifier));
        vm.expectRevert(ERC721AIAttestationHook.AttestationVerificationFailed.selector);
        hook.registerAndVerifyAttestation(1, keccak256("m"), keccak256("a"), ATTESTATION_KIND, "bad");
    }

    function test_WorksWithAcceptAllMode() public {
        hook.setAttestationVerifier(ATTESTATION_KIND, address(mockVerifier));
        mockVerifier.setAcceptAll(true);

        hook.registerAndVerifyAttestation(1, keccak256("m"), keccak256("a"), ATTESTATION_KIND, "any");
    }

    function test_EmitsAttestationVerified() public {
        hook.setAttestationVerifier(ATTESTATION_KIND, address(mockVerifier));
        mockVerifier.setAcceptAll(true);

        bytes32 modelId = keccak256("m");
        bytes32 artifactHash = keccak256("a");
        bytes memory attestationData = "data";
        bytes32 attHash = keccak256(attestationData);

        vm.expectEmit(true, true, true, false);
        emit ERC721AIAttestationHook.TrainingAttestationVerified(1, modelId, artifactHash, ATTESTATION_KIND, address(mockVerifier), attHash);
        hook.registerAndVerifyAttestation(1, modelId, artifactHash, ATTESTATION_KIND, attestationData);
    }

    function test_CanOverwriteAttestation() public {
        hook.setAttestationVerifier(ATTESTATION_KIND, address(mockVerifier));
        mockVerifier.setAcceptAll(true);

        hook.registerAndVerifyAttestation(1, keccak256("m"), keccak256("a"), ATTESTATION_KIND, "first");
        hook.registerAndVerifyAttestation(1, keccak256("m"), keccak256("a"), ATTESTATION_KIND, "second");

        (,,, , , uint64 verifiedAt) = hook.attestationsByTokenId(1);
        assertGt(verifiedAt, 0);
    }

    function test_AnyoneCanRegisterIfVerifierSet() public {
        hook.setAttestationVerifier(ATTESTATION_KIND, address(mockVerifier));
        mockVerifier.setAcceptAll(true);

        vm.prank(other);
        hook.registerAndVerifyAttestation(1, keccak256("m"), keccak256("a"), ATTESTATION_KIND, "data");
    }

    function test_MultipleTokenAttestations() public {
        hook.setAttestationVerifier(ATTESTATION_KIND, address(mockVerifier));
        mockVerifier.setAcceptAll(true);

        hook.registerAndVerifyAttestation(1, keccak256("m1"), keccak256("a1"), ATTESTATION_KIND, "d1");
        hook.registerAndVerifyAttestation(2, keccak256("m2"), keccak256("a2"), ATTESTATION_KIND, "d2");

        (bytes32 m1,,,,,) = hook.attestationsByTokenId(1);
        (bytes32 m2,,,,,) = hook.attestationsByTokenId(2);
        assertEq(m1, keccak256("m1"));
        assertEq(m2, keccak256("m2"));
    }

    function test_MultipleAttestationKinds() public {
        bytes32 kind1 = keccak256("zk-tee");
        bytes32 kind2 = keccak256("sgx");

        MockTrainingAttestationVerifier verifier2 = new MockTrainingAttestationVerifier();
        verifier2.setAcceptAll(true);

        hook.setAttestationVerifier(kind1, address(mockVerifier));
        hook.setAttestationVerifier(kind2, address(verifier2));

        mockVerifier.setAcceptAll(true);

        hook.registerAndVerifyAttestation(1, keccak256("m"), keccak256("a"), kind1, "d1");
        hook.registerAndVerifyAttestation(2, keccak256("m"), keccak256("a"), kind2, "d2");
    }
}