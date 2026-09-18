Feature: PTAS foundation controls

  Scenario: One annual assessment per taxpayer
    Given a taxpayer has an assessment for financial year "TEST-2026"
    When an authorized user attempts to create another assessment for that taxpayer and year
    Then the operation is rejected with a conflict
    And no second assessment is stored
    And an audit event records the rejected attempt without sensitive payload data

  Scenario: Approved assessment is immutable
    Given assessment version 1 is approved
    When an inspector identifies a correction
    Then the system creates revision version 2
    And version 1 remains unchanged and readable
    And demand does not change until version 2 is approved

  Scenario: Jurisdiction is enforced on the server
    Given an inspector is assigned to circle A
    When the inspector requests a taxpayer belonging only to circle B
    Then the server returns a forbidden or not-found response according to security policy
    And the record is not disclosed

  Scenario: Duplicate payment callback is idempotent
    Given a valid provider event has already been processed
    When the same provider event is received again
    Then no duplicate payment or ledger entry is created
    And the repeated event is recorded as idempotently handled
