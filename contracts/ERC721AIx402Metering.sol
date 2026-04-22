// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title ERC721AIx402Metering
 * @notice Per-inference USDC payment metering for ERC-721 tokenised AI models.
 *
 * Each tokenised AI model (identified by tokenId) has an owner-set price per
 * inference. Callers pay USDC into this contract which splits revenue between
 * the model owner and a protocol fee recipient.
 *
 * Designed to work alongside ERC721AIAttestationHook for provenance and
 * the x402 payment standard for HTTP-level 402 flows.
 *
 * Flow:
 *   1. Model owner registers price: setInferencePrice(tokenId, priceUSDC)
 *   2. Caller approves USDC to this contract
 *   3. Caller calls payForInference(tokenId) — USDC is transferred
 *   4. Off-chain inference server checks InferencePaid event before serving
 *   5. Model owner withdraws accumulated revenue
 */
contract ERC721AIx402Metering {
    using SafeERC20 for IERC20;

    // ─── State ────────────────────────────────────────────────────────────

    struct ModelConfig {
        address owner;           // Model owner (receives revenue)
        uint128 pricePerInference; // Price in USDC atomic units (6 decimals)
        bool active;
    }

    IERC20 public immutable usdc;
    address public protocolFeeRecipient;
    uint16 public protocolFeeBps;   // Basis points (e.g. 250 = 2.5%)

    mapping(uint256 => ModelConfig) public models;
    mapping(uint256 => uint256) public totalInferences;
    mapping(address => uint256) public revenueBalance;   // Withdrawable balance per owner

    // ─── Events ───────────────────────────────────────────────────────────

    event ModelRegistered(uint256 indexed tokenId, address indexed owner, uint128 price);
    event InferencePriceUpdated(uint256 indexed tokenId, uint128 oldPrice, uint128 newPrice);
    event InferencePaid(
        uint256 indexed tokenId,
        address indexed caller,
        uint128 amount,
        uint256 inferenceCount
    );
    event RevenueWithdrawn(address indexed owner, uint256 amount);
    event ProtocolFeeUpdated(uint16 oldBps, uint16 newBps);

    // ─── Errors ───────────────────────────────────────────────────────────

    error NotModelOwner();
    error ModelNotActive();
    error ModelAlreadyRegistered();
    error ZeroPrice();
    error FeeTooHigh();

    // ─── Admin ────────────────────────────────────────────────────────────

    address public admin;

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotModelOwner();
        _;
    }

    modifier onlyModelOwner(uint256 tokenId) {
        if (msg.sender != models[tokenId].owner) revert NotModelOwner();
        _;
    }

    constructor(address _usdc, address _admin, address _feeRecipient, uint16 _feeBps) {
        if (_feeBps > 1000) revert FeeTooHigh(); // Max 10%
        usdc = IERC20(_usdc);
        admin = _admin;
        protocolFeeRecipient = _feeRecipient;
        protocolFeeBps = _feeBps;
    }

    // ─── Model Registration ──────────────────────────────────────────────

    function registerModel(uint256 tokenId, uint128 pricePerInference) external {
        if (models[tokenId].owner != address(0)) revert ModelAlreadyRegistered();
        if (pricePerInference == 0) revert ZeroPrice();

        models[tokenId] = ModelConfig({
            owner: msg.sender,
            pricePerInference: pricePerInference,
            active: true
        });

        emit ModelRegistered(tokenId, msg.sender, pricePerInference);
    }

    function setInferencePrice(uint256 tokenId, uint128 newPrice) external onlyModelOwner(tokenId) {
        if (newPrice == 0) revert ZeroPrice();
        uint128 oldPrice = models[tokenId].pricePerInference;
        models[tokenId].pricePerInference = newPrice;
        emit InferencePriceUpdated(tokenId, oldPrice, newPrice);
    }

    function setModelActive(uint256 tokenId, bool active) external onlyModelOwner(tokenId) {
        models[tokenId].active = active;
    }

    // ─── Payment ─────────────────────────────────────────────────────────

    /**
     * @notice Pay for one inference on the given AI model.
     * @dev Caller must have approved USDC >= pricePerInference to this contract.
     *      Emits InferencePaid which the off-chain server watches.
     */
    function payForInference(uint256 tokenId) external {
        ModelConfig memory model = models[tokenId];
        if (!model.active) revert ModelNotActive();

        uint128 price = model.pricePerInference;
        uint128 fee = uint128(uint256(price) * protocolFeeBps / 10000);
        uint128 ownerShare = price - fee;

        // Transfer USDC from caller
        usdc.safeTransferFrom(msg.sender, address(this), price);

        // Credit revenue
        revenueBalance[model.owner] += ownerShare;
        if (fee > 0) {
            revenueBalance[protocolFeeRecipient] += fee;
        }

        totalInferences[tokenId] += 1;

        emit InferencePaid(tokenId, msg.sender, price, totalInferences[tokenId]);
    }

    /**
     * @notice Pay for multiple inferences at once.
     */
    function payForInferences(uint256 tokenId, uint256 count) external {
        ModelConfig memory model = models[tokenId];
        if (!model.active) revert ModelNotActive();

        uint256 totalPrice = uint256(model.pricePerInference) * count;
        uint256 fee = totalPrice * protocolFeeBps / 10000;
        uint256 ownerShare = totalPrice - fee;

        usdc.safeTransferFrom(msg.sender, address(this), totalPrice);

        revenueBalance[model.owner] += ownerShare;
        if (fee > 0) {
            revenueBalance[protocolFeeRecipient] += fee;
        }

        totalInferences[tokenId] += count;

        emit InferencePaid(tokenId, msg.sender, uint128(totalPrice), totalInferences[tokenId]);
    }

    // ─── Withdrawals ─────────────────────────────────────────────────────

    function withdrawRevenue() external {
        uint256 amount = revenueBalance[msg.sender];
        if (amount == 0) return;

        revenueBalance[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);

        emit RevenueWithdrawn(msg.sender, amount);
    }

    // ─── Views ───────────────────────────────────────────────────────────

    function getInferencePrice(uint256 tokenId) external view returns (uint128) {
        return models[tokenId].pricePerInference;
    }

    function getModelInfo(uint256 tokenId) external view returns (
        address owner,
        uint128 price,
        bool active,
        uint256 inferences
    ) {
        ModelConfig memory m = models[tokenId];
        return (m.owner, m.pricePerInference, m.active, totalInferences[tokenId]);
    }

    // ─── Admin ───────────────────────────────────────────────────────────

    function setProtocolFee(uint16 newBps) external onlyAdmin {
        if (newBps > 1000) revert FeeTooHigh();
        emit ProtocolFeeUpdated(protocolFeeBps, newBps);
        protocolFeeBps = newBps;
    }
}
