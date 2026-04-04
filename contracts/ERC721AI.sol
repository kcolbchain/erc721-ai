// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title ERC721AI
 * @notice ERC-721 token representing ownership of fine-tuned AI model weights.
 *         Each token stores provenance metadata: model hash, storage references
 *         (IPFS CID / Arweave tx ID), architecture description, and training
 *         dataset hash.
 */
contract ERC721AI is ERC721, Ownable {
    using Counters for Counters.Counter;

    struct ModelMetadata {
        bytes32 modelHash;            // SHA-256 of model weights
        string  storageCid;           // IPFS CID where weights are pinned
        string  arweaveTxn;           // Arweave transaction ID (optional)
        string  architecture;         // e.g. "ResNet-50", "GPT-2-medium"
        bytes32 trainingDatasetHash;  // SHA-256 of the training dataset
        string  metadataURI;          // IPFS URI of the full metadata JSON
    }

    Counters.Counter private _tokenIdCounter;

    /// @notice tokenId → full metadata
    mapping(uint256 => ModelMetadata) private _metadata;

    /// @notice modelHash → tokenId  (prevents duplicate mints for the same weights)
    mapping(bytes32 => uint256) public modelHashToTokenId;

    event ModelMinted(
        uint256 indexed tokenId,
        address indexed owner,
        bytes32 modelHash,
        string  storageCid,
        string  arweaveTxn
    );

    error ModelHashAlreadyRegistered(bytes32 modelHash, uint256 existingTokenId);
    error EmptyModelHash();
    error EmptyStorageCid();

    constructor() ERC721("ERC721AI", "AIMODEL") Ownable() {}

    /**
     * @notice Mint a new AI-model NFT.
     * @param to              Recipient address.
     * @param modelHash       SHA-256 hash of the model weights file.
     * @param storageCid      IPFS CID where the weights are stored.
     * @param arweaveTxn      Arweave transaction ID (can be empty).
     * @param architecture    Free-text description of the model architecture.
     * @param datasetHash     SHA-256 hash of the training dataset.
     * @param metadataURI     IPFS URI pointing to the full metadata JSON.
     * @return tokenId        The newly minted token ID.
     */
    function mintModel(
        address to,
        bytes32 modelHash,
        string  calldata storageCid,
        string  calldata arweaveTxn,
        string  calldata architecture,
        bytes32 datasetHash,
        string  calldata metadataURI
    ) external returns (uint256) {
        if (modelHash == bytes32(0)) revert EmptyModelHash();
        if (bytes(storageCid).length == 0) revert EmptyStorageCid();

        if (modelHashToTokenId[modelHash] != 0) {
            revert ModelHashAlreadyRegistered(modelHash, modelHashToTokenId[modelHash]);
        }

        _tokenIdCounter.increment();
        uint256 tokenId = _tokenIdCounter.current();

        _safeMint(to, tokenId);

        _metadata[tokenId] = ModelMetadata({
            modelHash:           modelHash,
            storageCid:          storageCid,
            arweaveTxn:          arweaveTxn,
            architecture:        architecture,
            trainingDatasetHash: datasetHash,
            metadataURI:         metadataURI
        });

        modelHashToTokenId[modelHash] = tokenId;

        emit ModelMinted(tokenId, to, modelHash, storageCid, arweaveTxn);

        return tokenId;
    }

    // ── View helpers ────────────────────────────────────────────────

    /**
     * @notice Returns the IPFS metadata URI for a token (ERC-721 tokenURI).
     */
    function tokenURI(uint256 tokenId)
        public
        view
        override
        returns (string memory)
    {
        _requireMinted(tokenId);
        return _metadata[tokenId].metadataURI;
    }

    /**
     * @notice Returns the full on-chain metadata struct for a token.
     */
    function getModelMetadata(uint256 tokenId)
        external
        view
        returns (ModelMetadata memory)
    {
        _requireMinted(tokenId);
        return _metadata[tokenId];
    }

    /**
     * @notice Verify that a given weights file matches the on-chain model hash.
     * @param tokenId   Token to verify against.
     * @param hash      SHA-256 hash to compare.
     * @return valid    True when hashes match.
     */
    function verifyModelHash(uint256 tokenId, bytes32 hash)
        external
        view
        returns (bool valid)
    {
        _requireMinted(tokenId);
        return _metadata[tokenId].modelHash == hash;
    }

    /**
     * @notice Total number of minted tokens.
     */
    function totalSupply() external view returns (uint256) {
        return _tokenIdCounter.current();
    }
}
