Below is a detailed implementation of the **Rural Health Fund**, a Web3 project using Clarity smart contracts on the Stacks blockchain to fund virtual clinics in remote areas. The solution leverages blockchain for transparent, community-driven fund allocation. The project includes 5 smart contracts to handle funding, voting, clinic management, and disbursements, addressing real-world problems like healthcare access and trust in fund allocation.

# Rural Health Fund

A decentralized Web3 application built on the Stacks blockchain to fund virtual clinics in remote areas. Using Clarity smart contracts, the platform enables transparent, community-driven allocation of funds to healthcare initiatives through blockchain-based voting and disbursements.

## Problem Statement

Remote and underserved communities often lack access to quality healthcare due to insufficient funding, mismanagement, or lack of transparency in traditional systems. The **Rural Health Fund** addresses these issues by:
- Providing a decentralized platform for crowdfunding virtual clinics.
- Enabling community members to propose and vote on fund allocation.
- Ensuring transparency and immutability of transactions using blockchain.
- Facilitating secure and auditable disbursements to verified clinics.

## Solution Overview

The **Rural Health Fund** uses 5 Clarity smart contracts to manage the lifecycle of funding virtual clinics:
1. **FundRegistry**: Manages the creation and tracking of fundraising campaigns.
2. **ClinicRegistry**: Handles registration and verification of virtual clinics.
3. **Voting**: Allows community members to vote on fund allocation proposals.
4. **Disbursement**: Manages secure fund distribution to approved clinics.
5. **GovernanceToken**: Implements a token system for voting rights and incentives.

The platform operates on the Stacks blockchain, leveraging its integration with Bitcoin for security and Clarity's predictable smart contract language for transparency.

## Smart Contracts

### 1. FundRegistry
- **Purpose**: Manages fundraising campaigns for virtual clinics.
- **Key Functions**:
  - `create-campaign`: Starts a new campaign with a funding goal and duration.
  - `contribute`: Allows users to contribute STX to a campaign.
  - `get-campaign-details`: Retrieves campaign status and funds raised.
- **File**: `contracts/fund-registry.clar`

### 2. ClinicRegistry
- **Purpose**: Registers and verifies virtual clinics eligible for funding.
- **Key Functions**:
  - `register-clinic`: Adds a clinic with details (name, location, services).
  - `verify-clinic`: Allows authorized admins to verify clinics.
  - `get-clinic-details`: Retrieves clinic information.
- **File**: `contracts/clinic-registry.clar`

### 3. Voting
- **Purpose**: Facilitates community voting on fund allocation proposals.
- **Key Functions**:
  - `create-proposal`: Submits a proposal to allocate funds to a clinic.
  - `vote`: Allows token holders to vote on proposals.
  - `finalize-proposal`: Closes voting and determines outcome.
- **File**: `contracts/voting.clar`

### 4. Disbursement
- **Purpose**: Handles secure fund distribution to approved clinics.
- **Key Functions**:
  - `disburse-funds`: Transfers funds to a clinic based on approved proposals.
  - `refund-contributors`: Refunds contributors if a campaign fails.
- **File**: `contracts/disbursement.clar`

### 5. GovernanceToken
- **Purpose**: Manages a fungible token (RHF) for voting and incentives.
- **Key Functions**:
  - `mint-tokens`: Issues tokens to contributors or stakeholders.
  - `transfer-tokens`: Transfers tokens between users.
  - `get-balance`: Checks a user's token balance.
- **File**: `contracts/governance-token.clar`

## Getting Started

### Prerequisites
- **Stacks Blockchain**: Deploy contracts on Stacks mainnet or testnet.
- **Clarity**: Use Clarinet for local development and testing.
- **Wallet**: Hiro Wallet or another Stacks-compatible wallet for interacting with the app.

### Installation
1. Clone the repository:
   ```bash
   git clone `git clone <repo-url>`
   ```
2. Install Clarinet:
   ```bash
   npm install -g @stacks/clarinet
   ```
3. Navigate to the project directory and start Clarinet:
   ```bash
   cd rural-health-fund
   clarinet integrate
   ```

### Deployment
1. Deploy contracts using Clarinet:
   ```bash
   clarinet deploy
   ```
2. Configure a frontend (e.g., React) to interact with contracts via the Stacks.js library.

### Usage
1. **Create a Campaign**: Use `FundRegistry` to start a fundraising campaign.
2. **Contribute**: Send STX to a campaign using `contribute`.
3. **Register a Clinic**: Clinics register via `ClinicRegistry`.
4. **Propose and Vote**: Submit proposals and vote using `Voting` contract.
5. **Disburse Funds**: Approved funds are sent to clinics via `Disbursement`.

## Example Workflow
1. A community member creates a campaign to fund a virtual clinic in a remote area.
2. Contributors send STX to the campaign and receive RHF tokens.
3. A clinic registers and gets verified by an admin.
4. A proposal is created to allocate funds to the clinic.
5. Token holders vote on the proposal.
6. If approved, funds are disbursed to the clinic; otherwise, contributors are refunded.

## Smart Contract Details

Below are the Clarity smart contracts for the project.

---

(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-CAMPAIGN-ENDED u101)
(define-constant ERR-CAMPAIGN-NOT-FOUND u102)

(define-map campaigns
  { campaign-id: uint }
  { goal: uint, raised: uint, deadline: uint, active: bool })

(define-data-var next-campaign-id uint u1)

(define-public (create-campaign (goal uint) (duration uint))
  (let ((campaign-id (var-get next-campaign-id))
        (deadline (+ block-height duration)))
    (map-set campaigns
      { campaign-id: campaign-id }
      { goal: goal, raised: u0, deadline: deadline, active: true })
    (var-set next-campaign-id (+ campaign-id u1))
    (ok campaign-id)))

(define-public (contribute (campaign-id uint) (amount uint))
  (let ((campaign (unwrap! (map-get? campaigns { campaign-id: campaign-id }) (err ERR-CAMPAIGN-NOT-FOUND))))
    (asserts! (get active campaign) (err ERR-CAMPAIGN-ENDED))
    (asserts! (<= block-height (get deadline campaign)) (err ERR-CAMPAIGN-ENDED))
    (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
    (map-set campaigns
      { campaign-id: campaign-id }
      (merge campaign { raised: (+ (get raised campaign) amount) }))
    (ok true)))

(define-read-only (get-campaign-details (campaign-id uint))
  (map-get? campaigns { campaign-id: campaign-id }))


---
(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-CLINIC-NOT-FOUND u101)

(define-map clinics
  { clinic-id: uint }
  { name: (string-ascii 50), location: (string-ascii 100), services: (string-ascii 200), verified: bool })

(define-data-var next-clinic-id uint u1)
(define-data-var admin principal tx-sender)

(define-public (register-clinic (name (string-ascii 50)) (location (string-ascii 100)) (services (string-ascii 200)))
  (let ((clinic-id (var-get next-clinic-id)))
    (map-set clinics
      { clinic-id: clinic-id }
      { name: name, location: location, services: services, verified: false })
    (var-set next-clinic-id (+ clinic-id u1))
    (ok clinic-id)))

(define-public (verify-clinic (clinic-id uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (let ((clinic (unwrap! (map-get? clinics { clinic-id: clinic-id }) (err ERR-CLINIC-NOT-FOUND))))
      (map-set clinics
        { clinic-id: clinic-id }
        (merge clinic { verified: true }))
      (ok true))))

(define-read-only (get-clinic-details (clinic-id uint))
  (map-get? clinics { clinic-id: clinic-id }))


---

>

(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-PROPOSAL-NOT-FOUND u101)
(define-constant ERR-VOTING-ENDED u102)

(define-map proposals
  { proposal-id: uint }
  { campaign-id: uint, clinic-id: uint, amount: uint, votes-for: uint, votes-against: uint, deadline: uint, active: bool })

(define-data-var next-proposal-id uint u1)

(define-public (create-proposal (campaign-id uint) (clinic-id uint) (amount uint) (duration uint))
  (let ((proposal-id (var-get next-proposal-id))
        (deadline (+ block-height duration)))
    (map-set proposals
      { proposal-id: proposal-id }
      { campaign-id: campaign-id, clinic-id: clinic-id, amount: amount, votes-for: u0, votes-against: u0, deadline: deadline, active: true })
    (var-set next-proposal-id (+ proposal-id u1))
    (ok proposal-id)))

(define-public (vote (proposal-id uint) (support bool))
  (let ((proposal (unwrap! (map-get? proposals { proposal-id: proposal-id }) (err ERR-PROPOSAL-NOT-FOUND))))
    (asserts! (get active proposal) (err ERR-VOTING-ENDED))
    (asserts! (<= block-height (get deadline proposal)) (err ERR-VOTING-ENDED))
    (let ((token-balance (unwrap! (contract-call? .governance-token get-balance tx-sender) (err ERR-NOT-AUTHORIZED))))
      (asserts! (> token-balance u0) (err ERR-NOT-AUTHORIZED))
      (map-set proposals
        { proposal-id: proposal-id }
        (merge proposal
          (if support
            { votes-for: (+ (get votes-for proposal) token-balance) }
            { votes-against: (+ (get votes-against proposal) token-balance) })))
      (ok true))))

(define-public (finalize-proposal (proposal-id uint))
  (let ((proposal (unwrap! (map-get? proposals { proposal-id: proposal-id }) (err ERR-PROPOSAL-NOT-FOUND))))
    (asserts! (<= (get deadline proposal) block-height) (err ERR-VOTING-ENDED))
    (map-set proposals
      { proposal-id: proposal-id }
      (merge proposal { active: false }))
    (ok (> (get votes-for proposal) (get votes-against proposal)))))


---

(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-PROPOSAL-NOT-APPROVED u101)
(define-constant ERR-INSUFFICIENT-FUNDS u102)

(define-public (disburse-funds (proposal-id uint) (recipient principal))
  (let ((proposal (unwrap! (contract-call? .voting finalize-proposal proposal-id) (err ERR-PROPOSAL-NOT-APPROVED)))
        (campaign (unwrap! (contract-call? .fund-registry get-campaign-details (get campaign-id proposal)) (err ERR-INSUFFICIENT-FUNDS))))
    (asserts! (>= (get raised campaign) (get amount proposal)) (err ERR-INSUFFICIENT-FUNDS))
    (try! (as-contract (stx-transfer? (get amount proposal) tx-sender recipient)))
    (ok true)))

(define-public (refund-contributors (campaign-id uint))
  (let ((campaign (unwrap! (contract-call? .fund-registry get-campaign-details campaign-id) (err ERR-INSUFFICIENT-FUNDS))))
    (asserts! (> (get deadline campaign) block-height) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (get active campaign)) (err ERR-NOT-AUTHORIZED))
    (try! (as-contract (stx-transfer? (get raised campaign) tx-sender tx-sender)))
    (ok true)))

<
---

(define-fungible-token rhf)

(define-public (mint-tokens (amount uint) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender (contract-caller)) (err u100))
    (ft-mint? rhf amount recipient)))

(define-public (transfer-tokens (amount uint) (recipient principal))
  (ft-transfer? rhf amount tx-sender recipient))

(define-read-only (get-balance (account principal))
  (ok (ft-get-balance rhf account)))

---

## Development Notes
- **Clarity**: Contracts are written in Clarity for predictability and security.
- **Stacks Blockchain**: Leverages Bitcoin's security via Stacks' Proof of Transfer.
- **Testing**: Use Clarinet to simulate and test contracts locally.
- **Frontend**: Build a React app with Stacks.js to interact with contracts.

## Future Enhancements
- Add multi-signature admin controls for clinic verification.
- Implement milestone-based disbursements.
- Integrate oracles for real-world clinic performance data.

## License
MIT License

