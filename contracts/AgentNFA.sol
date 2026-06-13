// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AgentNFA — ERC-721 identity for PolyForge AI agents (the "brain")
/// @notice Each token is a reusable agent template (model + prompt commitment)
/// with an on-chain DID. A user mints an Agent once, then spins up Mandates
/// (ERC-7715 grants) that run it. Minimal self-contained ERC-721 (no external
/// deps) — production would use OpenZeppelin; transfers kept for wallet/explorer
/// compatibility.
contract AgentNFA {
    string public constant name = "PolyForge Agent";
    string public constant symbol = "PFA";

    struct Agent {
        address creator;
        string label;       // display name, e.g. "World Cup Underdog Hunter"
        string model;       // venice model id used by the brain
        bytes32 configHash;  // keccak of the full brain config (prompt + params)
        uint64 createdAt;
        bool copyable;       // true = public (anyone can run/copy); false = private (owner only)
    }

    // TODO (Agent-Fi roadmap): copy fee bps + performance fee bps per agent,
    // accrued to the NFA owner via a MasterChef-style splitter on each followed
    // bet; on-chain prompt commitment expansion (encrypted, owner-decryptable).
    // mapping(uint256 => uint16) public copyFeeBps;
    // mapping(uint256 => uint16) public performanceFeeBps;

    uint256 public agentCount; // tokenIds are 1..agentCount (0 is invalid)
    mapping(uint256 => Agent) public agents;

    // --- ERC-721 core state ---
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event AgentMinted(uint256 indexed tokenId, address indexed creator, string label, string model, bytes32 configHash);

    /// @notice Mint a new agent identity to `to`. Caller can be a backend
    /// operator minting on the creator's behalf; `creator`/owner is `to`.
    /// @param copyable true = public (anyone can run/copy), false = private (owner only).
    function mint(address to, string calldata label, string calldata model, bytes32 configHash, bool copyable)
        external
        returns (uint256 tokenId)
    {
        require(to != address(0), "zero to");
        tokenId = ++agentCount;
        agents[tokenId] = Agent(to, label, model, configHash, uint64(block.timestamp), copyable);
        _owners[tokenId] = to;
        _balances[to] += 1;
        emit Transfer(address(0), to, tokenId);
        emit AgentMinted(tokenId, to, label, model, configHash);
    }

    /// @notice Owner toggles public/private (gated execution).
    function setCopyable(uint256 tokenId, bool copyable) external {
        require(msg.sender == ownerOf(tokenId), "not owner");
        agents[tokenId].copyable = copyable;
    }

    /// @notice On-chain decentralized identifier for an agent.
    function did(uint256 tokenId) external view returns (string memory) {
        require(_owners[tokenId] != address(0), "no token");
        return string.concat("did:nfa:", _toString(block.chainid), ":", _toHexString(address(this)), ":", _toString(tokenId));
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        Agent memory a = agents[tokenId];
        require(a.creator != address(0), "no token");
        // inline JSON (not base64) — frontend reads the struct directly; this is
        // for explorer/wallet readability only
        return string.concat(
            '{"name":"', a.label, '","model":"', a.model, '","tokenId":', _toString(tokenId), "}"
        );
    }

    // --- ERC-721 read ---
    function balanceOf(address owner) external view returns (uint256) {
        require(owner != address(0), "zero owner");
        return _balances[owner];
    }

    function ownerOf(uint256 tokenId) public view returns (address owner) {
        owner = _owners[tokenId];
        require(owner != address(0), "no token");
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        require(_owners[tokenId] != address(0), "no token");
        return _tokenApprovals[tokenId];
    }

    function isApprovedForAll(address owner, address operator) external view returns (bool) {
        return _operatorApprovals[owner][operator];
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x80ac58cd // ERC721
            || interfaceId == 0x5b5e139f // ERC721Metadata
            || interfaceId == 0x01ffc9a7; // ERC165
    }

    // --- ERC-721 write ---
    function approve(address to, uint256 tokenId) external {
        address owner = ownerOf(tokenId);
        require(msg.sender == owner || _operatorApprovals[owner][msg.sender], "not authorized");
        _tokenApprovals[tokenId] = to;
        emit Approval(owner, to, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        require(to != address(0), "zero to");
        address owner = ownerOf(tokenId);
        require(owner == from, "wrong from");
        require(
            msg.sender == owner || _tokenApprovals[tokenId] == msg.sender || _operatorApprovals[owner][msg.sender],
            "not authorized"
        );
        delete _tokenApprovals[tokenId];
        _balances[from] -= 1;
        _balances[to] += 1;
        _owners[tokenId] = to;
        agents[tokenId].creator = to; // creator tracks current owner for the registry view
        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        transferFrom(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata) external {
        transferFrom(from, to, tokenId);
    }

    // --- string helpers ---
    function _toString(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 temp = v;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buf = new bytes(digits);
        while (v != 0) { digits -= 1; buf[digits] = bytes1(uint8(48 + v % 10)); v /= 10; }
        return string(buf);
    }

    function _toHexString(address addr) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes20 data = bytes20(addr);
        bytes memory str = new bytes(42);
        str[0] = "0";
        str[1] = "x";
        for (uint256 i = 0; i < 20; i++) {
            str[2 + i * 2] = alphabet[uint8(data[i] >> 4)];
            str[3 + i * 2] = alphabet[uint8(data[i] & 0x0f)];
        }
        return string(str);
    }
}
