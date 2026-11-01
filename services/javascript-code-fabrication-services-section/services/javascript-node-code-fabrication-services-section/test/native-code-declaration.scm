(use-modules (native-code-programme) (native-code-declaration)
             (guix store) (guix gexp) (guix monads) (guix derivations)
             (json) (srfi srfi-1))

;; Native receiving takes an actual registered construction and its already
;; built original output. It neither builds nor starts the application.
(define args (cdr (command-line)))
(unless (= 3 (length args)) (error "declaration, exact output and exact derivation required"))
(define declaration (car args))
(define output (cadr args))
(define expected-derivation (caddr args))
(define data (call-with-input-file declaration json->scm))
(define construction (native-code-construction-from-declaration declaration))
(define lowered
  (with-store store
    (run-with-store store (lower-object (native-code-construction-input construction)))))
(unless (equal? expected-derivation (derivation-file-name lowered))
  (error "sealed construction changed the original derivation" (derivation-file-name lowered)))
(define product (receive-native-code-output construction output))
(unless (and (native-code-product? product)
             (equal? (assoc-ref data "node") (native-code-product-programme-runtime product))
             (native-code-product-binds-source? product output))
  (error "original product did not retain its selected runtime"))
(define (refused thunk)
  (unless (catch #t (lambda () (thunk) #f) (lambda _ #t))
    (error "invalid declaration or product was admitted")))
(refused (lambda () (receive-native-code-output #t output)))
(refused (lambda () (receive-native-code-output construction (assoc-ref data "source"))))
(refused (lambda () (native-code-product-programme-runtime #t)))
(define (replace key value)
  (map (lambda (pair) (if (equal? key (car pair)) (cons key value) pair)) data))
(define (registered-variant value)
  (let ((file "native-code-declaration-negative.json"))
    (call-with-output-file file (lambda (port) (scm->json value port)))
    (with-store store (add-to-store store "native-code-declaration-negative.json" #f "sha256" (canonicalize-path file)))))
(for-each
  (lambda (invalid)
    (refused (lambda () (native-code-construction-from-declaration (registered-variant invalid)))))
  (list (cons '("typedProgramme" . #t) data)
        (cons '("procedure" . "caller-code") data)
        (replace "sourceName" "../other")
        (replace "node" "/usr/bin/node")
        (replace "archiveInputs" #())))
(define changed
  (native-code-construction-from-declaration
    (registered-variant (replace "entry" (string-append (assoc-ref data "entry") ".different")))))
(refused (lambda () (receive-native-code-output changed output)))
(define changed-source
  (native-code-construction-from-declaration
    (registered-variant (replace "source" (string-append (assoc-ref data "source") "/src")))))
(refused (lambda () (receive-native-code-output changed-source output)))
(define changed-archive
  (native-code-construction-from-declaration
    (registered-variant (replace "archiveInputs"
      (make-vector (vector-length (assoc-ref data "archiveInputs")) (assoc-ref data "parser"))))))
(refused (lambda () (receive-native-code-output changed-archive output)))
(display "exact sealed declaration preserves original derivation, typed product and selected Node; invalid declarations and outputs refused\n")
