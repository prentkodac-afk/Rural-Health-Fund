(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-CAMPAIGN-ENDED u101)
(define-constant ERR-CAMPAIGN-NOT-FOUND u102)
(define-constant ERR-INSUFFICIENT-FUNDS u103)
(define-constant ERR-INVALID-AMOUNT u104)
(define-constant ERR-INVALID-DURATION u105)
(define-constant ERR-INVALID-NAME u106)
(define-constant ERR-INVALID-DESCRIPTION u107)
(define-constant ERR-CAMPAIGN-ACTIVE u108)
(define-constant ERR-INVALID-ADMIN u109)
(define-constant ERR-MAX-CAMPAIGNS u110)
(define-constant ERR-INVALID-TIMESTAMP u111)
(define-constant ERR-INVALID-FEE u112)

(define-data-var next-campaign-id uint u1)
(define-data-var max-campaigns uint u1000)
(define-data-var admin principal tx-sender)
(define-data-var creation-fee uint u1000)
(define-data-var paused bool false)

(define-map campaigns
  { campaign-id: uint }
  { name: (string-utf8 100), description: (string-utf8 500), goal: uint, raised: uint, deadline: uint, active: bool, creator: principal, funds-locked: bool })

(define-map contributions
  { campaign-id: uint, contributor: principal }
  { amount: uint, timestamp: uint })

(define-map campaign-admins
  { campaign-id: uint, admin: principal }
  { active: bool })

(define-read-only (get-campaign (campaign-id uint))
  (map-get? campaigns { campaign-id: campaign-id }))

(define-read-only (get-contribution (campaign-id uint) (contributor principal))
  (map-get? contributions { campaign-id: campaign-id, contributor: contributor }))

(define-read-only (is-admin (campaign-id uint) (admin principal))
  (default-to false (get active (map-get? campaign-admins { campaign-id: campaign-id, admin: admin }))))

(define-read-only (is-paused)
  (var-get paused))

(define-read-only (get-campaign-count)
  (var-get next-campaign-id))

(define-private (validate-name (name (string-utf8 100)))
  (if (and (> (len name) u0) (<= (len name) u100))
      (ok true)
      (err ERR-INVALID-NAME)))

(define-private (validate-description (description (string-utf8 500)))
  (if (<= (len description) u500)
      (ok true)
      (err ERR-INVALID-DESCRIPTION)))

(define-private (validate-amount (amount uint))
  (if (> amount u0)
      (ok true)
      (err ERR-INVALID-AMOUNT)))

(define-private (validate-duration (duration uint))
  (if (> duration u0)
      (ok true)
      (err ERR-INVALID-DURATION)))

(define-private (validate-timestamp (timestamp uint))
  (if (>= timestamp block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP)))

(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (var-set admin new-admin)
    (ok true)))

(define-public (set-creation-fee (new-fee uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (asserts! (>= new-fee u0) (err ERR-INVALID-FEE))
    (var-set creation-fee new-fee)
    (ok true)))

(define-public (toggle-pause)
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (var-set paused (not (var-get paused)))
    (ok true)))

(define-public (add-campaign-admin (campaign-id uint) (admin principal))
  (let ((campaign (unwrap! (get-campaign campaign-id) (err ERR-CAMPAIGN-NOT-FOUND))))
    (asserts! (is-eq tx-sender (get creator campaign)) (err ERR-NOT-AUTHORIZED))
    (map-set campaign-admins { campaign-id: campaign-id, admin: admin } { active: true })
    (ok true)))

(define-public (remove-campaign-admin (campaign-id uint) (admin principal))
  (let ((campaign (unwrap! (get-campaign campaign-id) (err ERR-CAMPAIGN-NOT-FOUND))))
    (asserts! (is-eq tx-sender (get creator campaign)) (err ERR-NOT-AUTHORIZED))
    (map-set campaign-admins { campaign-id: campaign-id, admin: admin } { active: false })
    (ok true)))

(define-public (create-campaign (name (string-utf8 100)) (description (string-utf8 500)) (goal uint) (duration uint))
  (let ((campaign-id (var-get next-campaign-id))
        (deadline (+ block-height duration)))
    (asserts! (not (var-get paused)) (err ERR-NOT-AUTHORIZED))
    (asserts! (< campaign-id (var-get max-campaigns)) (err ERR-MAX-CAMPAIGNS))
    (try! (validate-name name))
    (try! (validate-description description))
    (try! (validate-amount goal))
    (try! (validate-duration duration))
    (try! (stx-transfer? (var-get creation-fee) tx-sender (var-get admin)))
    (map-set campaigns
      { campaign-id: campaign-id }
      { name: name, description: description, goal: goal, raised: u0, deadline: deadline, active: true, creator: tx-sender, funds-locked: false })
    (map-set campaign-admins { campaign-id: campaign-id, admin: tx-sender } { active: true })
    (var-set next-campaign-id (+ campaign-id u1))
    (print { event: "campaign-created", id: campaign-id })
    (ok campaign-id)))

(define-public (contribute (campaign-id uint) (amount uint))
  (let ((campaign (unwrap! (map-get? campaigns { campaign-id: campaign-id }) (err ERR-CAMPAIGN-NOT-FOUND))))
    (asserts! (not (var-get paused)) (err ERR-NOT-AUTHORIZED))
    (asserts! (get active campaign) (err ERR-CAMPAIGN-ENDED))
    (asserts! (<= block-height (get deadline campaign)) (err ERR-CAMPAIGN-ENDED))
    (asserts! (not (get funds-locked campaign)) (err ERR-CAMPAIGN-ENDED))
    (try! (validate-amount amount))
    (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
    (map-set campaigns
      { campaign-id: campaign-id }
      (merge campaign { raised: (+ (get raised campaign) amount) }))
    (map-set contributions
      { campaign-id: campaign-id, contributor: tx-sender }
      { amount: amount, timestamp: block-height })
    (print { event: "contribution", campaign-id: campaign-id, contributor: tx-sender, amount: amount })
    (ok true)))

(define-public (lock-funds (campaign-id uint))
  (let ((campaign (unwrap! (map-get? campaigns { campaign-id: campaign-id }) (err ERR-CAMPAIGN-NOT-FOUND))))
    (asserts! (is-admin campaign-id tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (get active campaign) (err ERR-CAMPAIGN-ENDED))
    (map-set campaigns
      { campaign-id: campaign-id }
      (merge campaign { funds-locked: true }))
    (print { event: "funds-locked", campaign-id: campaign-id })
    (ok true)))

(define-public (unlock-funds (campaign-id uint))
  (let ((campaign (unwrap! (map-get? campaigns { campaign-id: campaign-id }) (err ERR-CAMPAIGN-NOT-FOUND))))
    (asserts! (is-admin campaign-id tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (get active campaign) (err ERR-CAMPAIGN-ENDED))
    (map-set campaigns
      { campaign-id: campaign-id }
      (merge campaign { funds-locked: false }))
    (print { event: "funds-unlocked", campaign-id: campaign-id })
    (ok true)))

(define-public (end-campaign (campaign-id uint))
  (let ((campaign (unwrap! (map-get? campaigns { campaign-id: campaign-id }) (err ERR-CAMPAIGN-NOT-FOUND))))
    (asserts! (is-admin campaign-id tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (get active campaign) (err ERR-CAMPAIGN-ENDED))
    (map-set campaigns
      { campaign-id: campaign-id }
      (merge campaign { active: false }))
    (print { event: "campaign-ended", campaign-id: campaign-id })
    (ok true)))

(define-public (withdraw-funds (campaign-id uint) (recipient principal) (amount uint))
  (let ((campaign (unwrap! (map-get? campaigns { campaign-id: campaign-id }) (err ERR-CAMPAIGN-NOT-FOUND))))
    (asserts! (is-admin campaign-id tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (get active campaign)) (err ERR-CAMPAIGN-ACTIVE))
    (asserts! (<= amount (get raised campaign)) (err ERR-INSUFFICIENT-FUNDS))
    (try! (validate-amount amount))
    (try! (as-contract (stx-transfer? amount tx-sender recipient)))
    (map-set campaigns
      { campaign-id: campaign-id }
      (merge campaign { raised: (- (get raised campaign) amount) }))
    (print { event: "withdrawal", campaign-id: campaign-id, recipient: recipient, amount: amount })
    (ok true)))