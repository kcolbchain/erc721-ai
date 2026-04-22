// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ERC721AI — reference implementation of the ERC-721 AI model-asset standard.
/// @notice Self-contained: implements the ERC-721 subset this standard needs plus
///         ERC-2981 royalties, without external dependencies. Production deployments
///         SHOULD substitute a fully audited ERC-721 base (OpenZeppelin) — this
///         implementation optimizes for clarity and testability, not bytecode size.
/// @dev See `docs/spec-erc721-ai.md` for the full specification.
contract ERC721AI {
    // ─── ERC-721 minimal surface ─────────────────────────────────────────

    string public name;
    string public symbol;

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    // ─── ERC-721 AI model-asset surface ──────────────────────────────────

    struct ModelAsset {
        bytes32 modelId;
        bytes32 artifactHash;
        bytes32 baseModel;
        string  weightsCID;
        string  architecture;
        string  license;
        string  inferenceEndpoint;
        bytes32 attestationKind;
        uint16  creatorRoyaltyBps;
        uint64  createdAt;
        address creator;
    }

    /// @dev tokenId → model-asset record.
    mapping(uint256 => ModelAsset) private _assets;

    /// @dev modelId → tokenId. Used for provenance-chain traversal.
    mapping(bytes32 => uint256) public tokenIdByModelId;

    /// @dev Incrementing counter. tokenIds start at 1 (zero is reserved for "absent").
    uint256 public totalSupply;

    event ModelMinted(
        uint256 indexed tokenId,
        bytes32 indexed modelId,
        bytes32 indexed artifactHash,
        address creator,
        string weightsCID
    );

    event InferenceEndpointUpdated(uint256 indexed tokenId, string endpoint);
    event AttestationKindUpdated(uint256 indexed tokenId, bytes32 kind);

    // ─── Errors ───────────────────────────────────────────────────────────

    error NotOwnerOrApproved();
    error TokenDoesNotExist();
    error InvalidRecipient();
    error ModelIdAlreadyMinted();
    error ZeroArtifactHash();
    error ZeroModelId();
    error RoyaltyTooHigh();
    error BaseModelNotFound();
    error NotTokenOwner();

    // ─── Constructor ──────────────────────────────────────────────────────

    constructor(string memory name_, string memory symbol_) {
        name = name_;
        symbol = symbol_;
    }

    // ─── ERC-721 AI public API ───────────────────────────────────────────

    /// @notice Mint a new model-asset token.
    /// @dev Reverts if `modelId` has already been minted, if `artifactHash` or
    ///      `modelId` is zero, if `creatorRoyaltyBps > 10000`, or if a non-zero
    ///      `baseModel` does not resolve to an existing token on this contract.
    function mintModel(
        address to,
        bytes32 modelId,
        bytes32 artifactHash,
        bytes32 baseModel,
        string calldata weightsCID,
        string calldata architecture,
        string calldata license,
        string calldata inferenceEndpoint,
        uint16 creatorRoyaltyBps
    ) external returns (uint256 tokenId) {
        if (to == address(0)) revert InvalidRecipient();
        if (modelId == bytes32(0)) revert ZeroModelId();
        if (artifactHash == bytes32(0)) revert ZeroArtifactHash();
        if (tokenIdByModelId[modelId] != 0) revert ModelIdAlreadyMinted();
        if (creatorRoyaltyBps > 10_000) revert RoyaltyTooHigh();
        if (baseModel != bytes32(0) && tokenIdByModelId[baseModel] == 0) revert BaseModelNotFound();

        unchecked {
            totalSupply += 1;
        }
        tokenId = totalSupply;

        _assets[tokenId] = ModelAsset({
            modelId: modelId,
            artifactHash: artifactHash,
            baseModel: baseModel,
            weightsCID: weightsCID,
            architecture: architecture,
            license: license,
            inferenceEndpoint: inferenceEndpoint,
            attestationKind: bytes32(0),
            creatorRoyaltyBps: creatorRoyaltyBps,
            createdAt: uint64(block.timestamp),
            creator: msg.sender
        });

        tokenIdByModelId[modelId] = tokenId;

        _mint(to, tokenId);

        emit ModelMinted(tokenId, modelId, artifactHash, msg.sender, weightsCID);
    }

    /// @notice Read a model-asset record.
    function modelAsset(uint256 tokenId) external view returns (
        bytes32 modelId,
        bytes32 artifactHash,
        bytes32 baseModel,
        string memory weightsCID,
        string memory architecture,
        string memory license,
        string memory inferenceEndpoint,
        uint16 creatorRoyaltyBps,
        uint64 createdAt,
        address creator
    ) {
        if (_owners[tokenId] == address(0)) revert TokenDoesNotExist();
        ModelAsset storage m = _assets[tokenId];
        return (
            m.modelId,
            m.artifactHash,
            m.baseModel,
            m.weightsCID,
            m.architecture,
            m.license,
            m.inferenceEndpoint,
            m.creatorRoyaltyBps,
            m.createdAt,
            m.creator
        );
    }

    /// @notice Update the inference endpoint. Only the current token owner may call.
    function setInferenceEndpoint(uint256 tokenId, string calldata endpoint) external {
        if (_owners[tokenId] == address(0)) revert TokenDoesNotExist();
        if (_owners[tokenId] != msg.sender) revert NotTokenOwner();
        _assets[tokenId].inferenceEndpoint = endpoint;
        emit InferenceEndpointUpdated(tokenId, endpoint);
    }

    /// @notice Set the attestation kind for a token. Only the original creator may call.
    /// @dev Intended to be called by (or on behalf of) the creator after an attestation
    ///      has been registered in the `ERC721AIAttestationHook`. The hook enforces
    ///      the actual cryptographic verification; this setter records which kind
    ///      of attestation accompanies the token for discovery.
    function setAttestationKind(uint256 tokenId, bytes32 kind) external {
        if (_owners[tokenId] == address(0)) revert TokenDoesNotExist();
        if (_assets[tokenId].creator != msg.sender) revert NotOwnerOrApproved();
        _assets[tokenId].attestationKind = kind;
        emit AttestationKindUpdated(tokenId, kind);
    }

    // ─── ERC-2981 royalties ──────────────────────────────────────────────

    /// @notice ERC-2981 royalty info.
    function royaltyInfo(uint256 tokenId, uint256 salePrice)
        external
        view
        returns (address receiver, uint256 royaltyAmount)
    {
        if (_owners[tokenId] == address(0)) revert TokenDoesNotExist();
        ModelAsset storage m = _assets[tokenId];
        receiver = m.creator;
        royaltyAmount = (salePrice * uint256(m.creatorRoyaltyBps)) / 10_000;
    }

    // ─── ERC-165 / interface support ─────────────────────────────────────

    /// @dev Minimal ERC-165. Returns true for ERC-721 (0x80ac58cd), ERC-165
    ///      (0x01ffc9a7), and ERC-2981 (0x2a55205a). Does NOT return true for
    ///      ERC721TokenReceiver or enumerable extensions — those are out of
    ///      scope for v0.
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7 // ERC-165
            || interfaceId == 0x80ac58cd // ERC-721
            || interfaceId == 0x5b5e139f // ERC-721 Metadata
            || interfaceId == 0x2a55205a; // ERC-2981
    }

    // ─── ERC-721 standard functions ──────────────────────────────────────

    function balanceOf(address owner) external view returns (uint256) {
        if (owner == address(0)) revert InvalidRecipient();
        return _balances[owner];
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address owner = _owners[tokenId];
        if (owner == address(0)) revert TokenDoesNotExist();
        return owner;
    }

    function approve(address to, uint256 tokenId) external {
        address owner = ownerOf(tokenId);
        if (msg.sender != owner && !_operatorApprovals[owner][msg.sender]) revert NotOwnerOrApproved();
        _tokenApprovals[tokenId] = to;
        emit Approval(owner, to, tokenId);
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        if (_owners[tokenId] == address(0)) revert TokenDoesNotExist();
        return _tokenApprovals[tokenId];
    }

    function setApprovalForAll(address operator, bool approved) external {
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address owner, address operator) external view returns (bool) {
        return _operatorApprovals[owner][operator];
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        if (!_isApprovedOrOwner(msg.sender, tokenId)) revert NotOwnerOrApproved();
        if (to == address(0)) revert InvalidRecipient();
        if (_owners[tokenId] != from) revert NotOwnerOrApproved();

        // Clear approvals.
        delete _tokenApprovals[tokenId];

        unchecked {
            _balances[from] -= 1;
            _balances[to] += 1;
        }
        _owners[tokenId] = to;

        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        transferFrom(from, to, tokenId);
        // NOTE: we do not call onERC721Received here because the reference impl
        // intentionally stays minimal. Production deployments that extend this
        // should re-instate the ERC721Receiver hook.
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata /* data */) external {
        transferFrom(from, to, tokenId);
    }

    // ─── Internals ────────────────────────────────────────────────────────

    function _mint(address to, uint256 tokenId) internal {
        unchecked {
            _balances[to] += 1;
        }
        _owners[tokenId] = to;
        emit Transfer(address(0), to, tokenId);
    }

    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address owner = _owners[tokenId];
        if (owner == address(0)) revert TokenDoesNotExist();
        return spender == owner
            || _tokenApprovals[tokenId] == spender
            || _operatorApprovals[owner][spender];
    }
}
