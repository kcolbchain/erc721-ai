// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/ERC721AI.sol";

contract ERC721AITest is Test {
    ERC721AI internal erc721ai;

    address internal creator;
    address internal alice;
    address internal bob;

    bytes32 internal constant MODEL_ID_A = keccak256("model-a");
    bytes32 internal constant ARTIFACT_HASH_A = keccak256("weights-a");
    bytes32 internal constant MODEL_ID_B = keccak256("model-b");
    bytes32 internal constant ARTIFACT_HASH_B = keccak256("weights-b");

    function setUp() public {
        creator = makeAddr("creator");
        alice = makeAddr("alice");
        bob = makeAddr("bob");

        erc721ai = new ERC721AI("ERC-721 AI", "AI721");
    }

    // ── Deployment ──────────────────────────────────────────────────────

    function test_NameAndSymbol() public view {
        assertEq(erc721ai.name(), "ERC-721 AI");
        assertEq(erc721ai.symbol(), "AI721");
    }

    function test_SupportsInterface() public view {
        assertTrue(erc721ai.supportsInterface(0x01ffc9a7)); // ERC-165
        assertTrue(erc721ai.supportsInterface(0x80ac58cd)); // ERC-721
        assertTrue(erc721ai.supportsInterface(0x5b5e139f)); // ERC-721 Metadata
        assertTrue(erc721ai.supportsInterface(0x2a55205a)); // ERC-2981
        assertFalse(erc721ai.supportsInterface(0xdeadbeef));
    }

    // ── Mint ────────────────────────────────────────────────────────────

    function test_MintsModelAsset() public {
        vm.prank(creator);
        uint256 tokenId = erc721ai.mintModel(
            alice,
            MODEL_ID_A,
            ARTIFACT_HASH_A,
            bytes32(0),
            "ipfs://weights-a",
            "llama-3.1-70b-instruct",
            "LLAMA3-COMMUNITY",
            "https://inf.example/m/a",
            500
        );

        assertEq(tokenId, 1);
        assertEq(erc721ai.ownerOf(1), alice);
        assertEq(erc721ai.balanceOf(alice), 1);
        assertEq(erc721ai.totalSupply(), 1);
        assertEq(erc721ai.tokenIdByModelId(MODEL_ID_A), 1);

        (
            bytes32 modelId,
            bytes32 artifactHash,
            bytes32 baseModel,
            string memory weightsCID,
            string memory architecture,
            string memory license,
            string memory inferenceEndpoint,
            uint16 creatorRoyaltyBps,
            uint64 createdAt,
            address creatorAddr
        ) = erc721ai.modelAsset(1);

        assertEq(modelId, MODEL_ID_A);
        assertEq(artifactHash, ARTIFACT_HASH_A);
        assertEq(baseModel, bytes32(0));
        assertEq(weightsCID, "ipfs://weights-a");
        assertEq(architecture, "llama-3.1-70b-instruct");
        assertEq(license, "LLAMA3-COMMUNITY");
        assertEq(inferenceEndpoint, "https://inf.example/m/a");
        assertEq(creatorRoyaltyBps, 500);
        assertGt(createdAt, 0);
        assertEq(creatorAddr, creator);
    }

    function test_RevertWhenMintToZero() public {
        vm.prank(creator);
        vm.expectRevert(ERC721AI.InvalidRecipient.selector);
        erc721ai.mintModel(address(0), MODEL_ID_A, ARTIFACT_HASH_A, bytes32(0), "", "", "", "", 0);
    }

    function test_RevertWhenZeroModelId() public {
        vm.prank(creator);
        vm.expectRevert(ERC721AI.ZeroModelId.selector);
        erc721ai.mintModel(alice, bytes32(0), ARTIFACT_HASH_A, bytes32(0), "", "", "", "", 0);
    }

    function test_RevertWhenZeroArtifactHash() public {
        vm.prank(creator);
        vm.expectRevert(ERC721AI.ZeroArtifactHash.selector);
        erc721ai.mintModel(alice, MODEL_ID_A, bytes32(0), bytes32(0), "", "", "", "", 0);
    }

    function test_RevertWhenDuplicateModelId() public {
        vm.startPrank(creator);
        erc721ai.mintModel(alice, MODEL_ID_A, ARTIFACT_HASH_A, bytes32(0), "", "", "", "", 0);
        vm.expectRevert(ERC721AI.ModelIdAlreadyMinted.selector);
        erc721ai.mintModel(alice, MODEL_ID_A, ARTIFACT_HASH_B, bytes32(0), "", "", "", "", 0);
        vm.stopPrank();
    }

    function test_RevertWhenRoyaltyTooHigh() public {
        vm.prank(creator);
        vm.expectRevert(ERC721AI.RoyaltyTooHigh.selector);
        erc721ai.mintModel(alice, MODEL_ID_A, ARTIFACT_HASH_A, bytes32(0), "", "", "", "", 10_001);
    }

    function test_RevertWhenBaseModelNotFound() public {
        bytes32 ghost = keccak256("ghost-base-model");
        vm.prank(creator);
        vm.expectRevert(ERC721AI.BaseModelNotFound.selector);
        erc721ai.mintModel(alice, MODEL_ID_A, ARTIFACT_HASH_A, ghost, "", "", "", "", 0);
    }

    // ── Provenance chain ────────────────────────────────────────────────

    function test_ProvenanceChainTwoHops() public {
        vm.startPrank(creator);
        uint256 tokenA = erc721ai.mintModel(alice, MODEL_ID_A, ARTIFACT_HASH_A, bytes32(0), "", "llama-3.1-70b", "MIT", "", 0);
        uint256 tokenB = erc721ai.mintModel(alice, MODEL_ID_B, ARTIFACT_HASH_B, MODEL_ID_A, "", "llama-3.1-70b-ft", "MIT", "", 0);
        vm.stopPrank();

        (,, bytes32 baseB,,,,,,,) = erc721ai.modelAsset(tokenB);
        assertEq(baseB, MODEL_ID_A);
        assertEq(erc721ai.tokenIdByModelId(baseB), tokenA);
    }

    // ── Royalties ───────────────────────────────────────────────────────

    function test_RoyaltyInfo() public {
        vm.prank(creator);
        uint256 tokenId = erc721ai.mintModel(alice, MODEL_ID_A, ARTIFACT_HASH_A, bytes32(0), "", "", "", "", 750);

        (address receiver, uint256 amount) = erc721ai.royaltyInfo(tokenId, 1 ether);
        assertEq(receiver, creator);
        assertEq(amount, (1 ether * 750) / 10_000);
    }

    function test_RoyaltyGoesToCreatorNotCurrentOwner() public {
        vm.prank(creator);
        uint256 tokenId = erc721ai.mintModel(alice, MODEL_ID_A, ARTIFACT_HASH_A, bytes32(0), "", "", "", "", 500);

        // Alice transfers to Bob.
        vm.prank(alice);
        erc721ai.transferFrom(alice, bob, tokenId);

        (address receiver,) = erc721ai.royaltyInfo(tokenId, 1 ether);
        assertEq(receiver, creator); // still creator, not Bob.
    }

    // ── Endpoint mutation ───────────────────────────────────────────────

    function test_OwnerCanUpdateInferenceEndpoint() public {
        vm.prank(creator);
        uint256 tokenId = erc721ai.mintModel(alice, MODEL_ID_A, ARTIFACT_HASH_A, bytes32(0), "", "", "", "https://old", 0);

        vm.prank(alice);
        erc721ai.setInferenceEndpoint(tokenId, "https://new");

        (,,,,,, string memory endpoint,,,) = erc721ai.modelAsset(tokenId);
        assertEq(endpoint, "https://new");
    }

    function test_RevertWhenNonOwnerUpdatesEndpoint() public {
        vm.prank(creator);
        uint256 tokenId = erc721ai.mintModel(alice, MODEL_ID_A, ARTIFACT_HASH_A, bytes32(0), "", "", "", "", 0);

        vm.prank(bob);
        vm.expectRevert(ERC721AI.NotTokenOwner.selector);
        erc721ai.setInferenceEndpoint(tokenId, "https://evil");
    }

    // ── Attestation kind mutation ───────────────────────────────────────

    function test_CreatorCanSetAttestationKind() public {
        vm.prank(creator);
        uint256 tokenId = erc721ai.mintModel(alice, MODEL_ID_A, ARTIFACT_HASH_A, bytes32(0), "", "", "", "", 0);

        bytes32 kind = keccak256("ZK_PROOF");
        vm.expectEmit(true, false, false, true);
        emit ERC721AI.AttestationKindUpdated(tokenId, kind);

        vm.prank(creator);
        erc721ai.setAttestationKind(tokenId, kind);
    }

    function test_RevertWhenNonCreatorSetsAttestation() public {
        vm.prank(creator);
        uint256 tokenId = erc721ai.mintModel(alice, MODEL_ID_A, ARTIFACT_HASH_A, bytes32(0), "", "", "", "", 0);

        vm.prank(alice); // owner, but not creator
        vm.expectRevert(ERC721AI.NotOwnerOrApproved.selector);
        erc721ai.setAttestationKind(tokenId, keccak256("ZK_PROOF"));
    }

    // ── Transfer semantics ──────────────────────────────────────────────

    function test_TransferFromUpdatesOwner() public {
        vm.prank(creator);
        uint256 tokenId = erc721ai.mintModel(alice, MODEL_ID_A, ARTIFACT_HASH_A, bytes32(0), "", "", "", "", 0);

        vm.prank(alice);
        erc721ai.transferFrom(alice, bob, tokenId);

        assertEq(erc721ai.ownerOf(tokenId), bob);
        assertEq(erc721ai.balanceOf(alice), 0);
        assertEq(erc721ai.balanceOf(bob), 1);
    }

    function test_RevertWhenUnauthorizedTransfer() public {
        vm.prank(creator);
        uint256 tokenId = erc721ai.mintModel(alice, MODEL_ID_A, ARTIFACT_HASH_A, bytes32(0), "", "", "", "", 0);

        vm.prank(bob);
        vm.expectRevert(ERC721AI.NotOwnerOrApproved.selector);
        erc721ai.transferFrom(alice, bob, tokenId);
    }

    function test_ApprovedAddressCanTransfer() public {
        vm.prank(creator);
        uint256 tokenId = erc721ai.mintModel(alice, MODEL_ID_A, ARTIFACT_HASH_A, bytes32(0), "", "", "", "", 0);

        vm.prank(alice);
        erc721ai.approve(bob, tokenId);

        vm.prank(bob);
        erc721ai.transferFrom(alice, bob, tokenId);

        assertEq(erc721ai.ownerOf(tokenId), bob);
    }
}
