<?php
/**
 * Main plugin class.
 *
 * @package TDM_Testimonials
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class TDM_Testimonials {
	const POST_TYPE       = 'tdm_testimonial';
	const META_AVATAR     = '_tdm_avatar_id';
	const META_RATING     = '_tdm_rating';
	const META_REVIEW_DATE = '_tdm_review_date';

	/** @var TDM_Testimonials|null */
	private static $instance = null;

	/** @var int */
	private $instance_count = 0;

	/**
	 * Return the singleton instance.
	 *
	 * @return TDM_Testimonials
	 */
	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	private function __construct() {
		add_action( 'init', array( $this, 'register_post_type' ) );
		add_action( 'init', array( $this, 'register_meta' ) );
		add_action( 'add_meta_boxes', array( $this, 'add_meta_box' ) );
		add_action( 'save_post_' . self::POST_TYPE, array( $this, 'save_meta' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_admin_assets' ) );
		add_action( 'admin_notices', array( $this, 'show_validation_notice' ) );
		add_filter( 'manage_' . self::POST_TYPE . '_posts_columns', array( $this, 'admin_columns' ) );
		add_action( 'manage_' . self::POST_TYPE . '_posts_custom_column', array( $this, 'render_admin_column' ), 10, 2 );
		add_filter( 'script_loader_tag', array( $this, 'protect_frontend_script_tag' ), 10, 3 );
		add_filter( 'litespeed_optimize_js_excludes', array( $this, 'exclude_frontend_script_from_litespeed' ) );
		add_filter( 'litespeed_optm_js_defer_exc', array( $this, 'exclude_frontend_script_from_litespeed' ) );
		add_filter( 'litespeed_optm_gm_js_exc', array( $this, 'exclude_frontend_script_from_litespeed' ) );
		add_shortcode( 'tdm_testimonials', array( $this, 'render_shortcode' ) );
	}

	/**
	 * Keep the marquee runtime out of JavaScript delay/combination pipelines.
	 *
	 * @param string $tag    Script tag HTML.
	 * @param string $handle Registered script handle.
	 * @param string $src    Script source URL.
	 * @return string
	 */
	public function protect_frontend_script_tag( $tag, $handle, $src ) {
		unset( $src );

		if ( 'tdm-testimonials' !== $handle || false !== strpos( $tag, 'data-no-optimize' ) ) {
			return $tag;
		}

		$protected_tag = preg_replace( '/<script\b/', '<script data-no-optimize="1" data-no-defer="1"', $tag, 1 );

		return is_string( $protected_tag ) ? $protected_tag : $tag;
	}

	/**
	 * Add the front-end runtime to LiteSpeed's supported exclusion lists.
	 *
	 * These filters are safe when LiteSpeed Cache is not installed because core
	 * simply stores the callbacks until a consumer applies the filter.
	 *
	 * @param array $excludes Existing exclusion patterns.
	 * @return array
	 */
	public function exclude_frontend_script_from_litespeed( $excludes ) {
		if ( ! is_array( $excludes ) ) {
			$excludes = array();
		}

		$excludes[] = '/tdm-testimonials/assets/js/testimonials.js';

		return array_values( array_unique( $excludes ) );
	}

	/** Register the testimonial post type. */
	public function register_post_type() {
		$labels = array(
			'name'               => __( 'Testimonials', 'tdm-testimonials' ),
			'singular_name'      => __( 'Testimonial', 'tdm-testimonials' ),
			'add_new'            => __( 'Add New', 'tdm-testimonials' ),
			'add_new_item'       => __( 'Add New Testimonial', 'tdm-testimonials' ),
			'edit_item'          => __( 'Edit Testimonial', 'tdm-testimonials' ),
			'new_item'           => __( 'New Testimonial', 'tdm-testimonials' ),
			'view_item'          => __( 'View Testimonial', 'tdm-testimonials' ),
			'search_items'       => __( 'Search Testimonials', 'tdm-testimonials' ),
			'not_found'          => __( 'No testimonials found.', 'tdm-testimonials' ),
			'not_found_in_trash' => __( 'No testimonials found in Trash.', 'tdm-testimonials' ),
			'menu_name'          => __( 'Testimonials', 'tdm-testimonials' ),
		);

		register_post_type(
			self::POST_TYPE,
			array(
				'labels'             => $labels,
				'public'             => false,
				'show_ui'            => true,
				'show_in_menu'       => true,
				'show_in_rest'       => false,
				'has_archive'        => false,
				'rewrite'            => false,
				'query_var'          => false,
				'exclude_from_search'=> true,
				'menu_icon'          => 'dashicons-format-quote',
				'supports'           => array( 'title', 'editor' ),
				'map_meta_cap'       => true,
			)
		);
	}

	/** Register typed private metadata. */
	public function register_meta() {
		register_post_meta(
			self::POST_TYPE,
			self::META_AVATAR,
			array(
				'type'              => 'integer',
				'single'            => true,
				'show_in_rest'      => false,
				'sanitize_callback' => 'absint',
				'auth_callback'     => array( $this, 'can_edit_meta' ),
			)
		);

		register_post_meta(
			self::POST_TYPE,
			self::META_RATING,
			array(
				'type'              => 'integer',
				'single'            => true,
				'default'           => 5,
				'show_in_rest'      => false,
				'sanitize_callback' => array( $this, 'sanitize_rating' ),
				'auth_callback'     => array( $this, 'can_edit_meta' ),
			)
		);

		register_post_meta(
			self::POST_TYPE,
			self::META_REVIEW_DATE,
			array(
				'type'              => 'string',
				'single'            => true,
				'show_in_rest'      => false,
				'sanitize_callback' => array( $this, 'sanitize_review_date' ),
				'auth_callback'     => array( $this, 'can_edit_meta' ),
			)
		);
	}

	/** @return bool */
	public function can_edit_meta( $allowed, $meta_key, $post_id ) {
		unset( $allowed, $meta_key );
		return current_user_can( 'edit_post', $post_id );
	}

	/** @return int */
	public function sanitize_rating( $value ) {
		$value = absint( $value );
		return ( $value >= 1 && $value <= 5 ) ? $value : 5;
	}

	/** @return string */
	public function sanitize_review_date( $value ) {
		$value = sanitize_text_field( $value );
		$date  = DateTimeImmutable::createFromFormat( '!Y-m-d', $value, wp_timezone() );
		return ( $date && $date->format( 'Y-m-d' ) === $value ) ? $value : '';
	}

	/** Add the testimonial details meta box. */
	public function add_meta_box() {
		add_meta_box(
			'tdm-testimonial-details',
			__( 'Testimonial Details', 'tdm-testimonials' ),
			array( $this, 'render_meta_box' ),
			self::POST_TYPE,
			'normal',
			'high'
		);
	}

	/** Render admin fields. */
	public function render_meta_box( $post ) {
		$avatar_id  = absint( get_post_meta( $post->ID, self::META_AVATAR, true ) );
		$rating     = $this->sanitize_rating( get_post_meta( $post->ID, self::META_RATING, true ) ?: 5 );
		$review_date = get_post_meta( $post->ID, self::META_REVIEW_DATE, true );

		wp_nonce_field( 'tdm_save_testimonial', 'tdm_testimonial_nonce' );
		?>
		<p>
			<strong><?php esc_html_e( 'Avatar', 'tdm-testimonials' ); ?></strong><br>
			<span class="tdm-avatar-preview"><?php echo $avatar_id ? wp_kses_post( wp_get_attachment_image( $avatar_id, array( 80, 80 ) ) ) : ''; ?></span>
			<input type="hidden" id="tdm_avatar_id" name="tdm_avatar_id" value="<?php echo esc_attr( $avatar_id ); ?>">
			<button type="button" class="button tdm-select-avatar"><?php esc_html_e( 'Select image', 'tdm-testimonials' ); ?></button>
			<button type="button" class="button-link-delete tdm-remove-avatar"<?php echo $avatar_id ? '' : ' hidden'; ?>><?php esc_html_e( 'Remove image', 'tdm-testimonials' ); ?></button>
		</p>
		<p>
			<label for="tdm_rating"><strong><?php esc_html_e( 'Rating', 'tdm-testimonials' ); ?></strong></label><br>
			<select id="tdm_rating" name="tdm_rating" required>
				<?php for ( $i = 5; $i >= 1; $i-- ) : ?>
					<option value="<?php echo esc_attr( $i ); ?>" <?php selected( $rating, $i ); ?>><?php echo esc_html( sprintf( _n( '%d star', '%d stars', $i, 'tdm-testimonials' ), $i ) ); ?></option>
				<?php endfor; ?>
			</select>
		</p>
		<p>
			<label for="tdm_review_date"><strong><?php esc_html_e( 'Review date', 'tdm-testimonials' ); ?></strong></label><br>
			<input type="date" id="tdm_review_date" name="tdm_review_date" value="<?php echo esc_attr( $review_date ); ?>" required>
		</p>
		<p class="description"><?php esc_html_e( 'The testimonial must have a reviewer name, testimonial text, rating, and review date before it will appear in the shortcode.', 'tdm-testimonials' ); ?></p>
		<?php
	}

	/** Save secure, validated metadata. */
	public function save_meta( $post_id ) {
		if ( ! isset( $_POST['tdm_testimonial_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['tdm_testimonial_nonce'] ) ), 'tdm_save_testimonial' ) ) {
			return;
		}

		if ( ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) || wp_is_post_revision( $post_id ) || ! current_user_can( 'edit_post', $post_id ) ) {
			return;
		}

		$avatar_id = isset( $_POST['tdm_avatar_id'] ) ? absint( $_POST['tdm_avatar_id'] ) : 0;
		if ( $avatar_id && ! wp_attachment_is_image( $avatar_id ) ) {
			$avatar_id = 0;
		}

		if ( $avatar_id ) {
			update_post_meta( $post_id, self::META_AVATAR, $avatar_id );
		} else {
			delete_post_meta( $post_id, self::META_AVATAR );
		}

		$rating = isset( $_POST['tdm_rating'] ) ? absint( $_POST['tdm_rating'] ) : 5;
		update_post_meta( $post_id, self::META_RATING, $this->sanitize_rating( $rating ) );

		$date = isset( $_POST['tdm_review_date'] ) ? $this->sanitize_review_date( wp_unslash( $_POST['tdm_review_date'] ) ) : '';
		if ( $date ) {
			update_post_meta( $post_id, self::META_REVIEW_DATE, $date );
		} else {
			delete_post_meta( $post_id, self::META_REVIEW_DATE );
		}

		if ( ! $date ) {
			set_transient( 'tdm_testimonial_validation_' . get_current_user_id(), 1, 45 );
		}
	}

	/** Display an admin validation notice after save. */
	public function show_validation_notice() {
		$key = 'tdm_testimonial_validation_' . get_current_user_id();
		if ( ! get_transient( $key ) ) {
			return;
		}
		delete_transient( $key );
		printf( '<div class="notice notice-error is-dismissible"><p>%s</p></div>', esc_html__( 'TDM Testimonials: enter a valid review date. Incomplete testimonials are not displayed.', 'tdm-testimonials' ) );
	}

	/** Load the media frame only on testimonial edit screens. */
	public function enqueue_admin_assets( $hook ) {
		if ( ! in_array( $hook, array( 'post.php', 'post-new.php' ), true ) || self::POST_TYPE !== get_current_screen()->post_type ) {
			return;
		}
		wp_enqueue_media();
		wp_enqueue_script( 'tdm-testimonials-admin', TDM_TESTIMONIALS_URL . 'assets/js/admin.js', array( 'jquery' ), TDM_TESTIMONIALS_VERSION, true );
	}

	/** @return array */
	public function admin_columns( $columns ) {
		$columns['tdm_rating'] = __( 'Rating', 'tdm-testimonials' );
		$columns['tdm_date']   = __( 'Review date', 'tdm-testimonials' );
		return $columns;
	}

	/** Render custom list-table columns. */
	public function render_admin_column( $column, $post_id ) {
		if ( 'tdm_rating' === $column ) {
			echo esc_html( $this->sanitize_rating( get_post_meta( $post_id, self::META_RATING, true ) ?: 5 ) . '/5' );
		} elseif ( 'tdm_date' === $column ) {
			$date = get_post_meta( $post_id, self::META_REVIEW_DATE, true );
			echo $date ? esc_html( wp_date( get_option( 'date_format' ), strtotime( $date . ' 12:00:00' ) ) ) : '&mdash;';
		}
	}

	/** Register and enqueue front-end assets when shortcode output is needed. */
	private function enqueue_frontend_assets() {
		wp_enqueue_style( 'tdm-testimonials', TDM_TESTIMONIALS_URL . 'assets/css/testimonials.css', array(), TDM_TESTIMONIALS_VERSION );
		wp_enqueue_script( 'tdm-testimonials', TDM_TESTIMONIALS_URL . 'assets/js/testimonials.js', array(), TDM_TESTIMONIALS_VERSION, true );
	}

	/** Render the public shortcode. */
	public function render_shortcode( $atts ) {
		$atts = shortcode_atts(
			array(
				'limit' => '0',
				'order' => 'DESC',
				'rows'  => '2',
				'speed' => '0.25',
			),
			$atts,
			'tdm_testimonials'
		);

		$limit = filter_var( $atts['limit'], FILTER_VALIDATE_INT );
		$limit = ( false !== $limit && $limit >= 0 && $limit <= 100 ) ? $limit : 0;
		$order = strtoupper( sanitize_text_field( $atts['order'] ) );
		$order = in_array( $order, array( 'ASC', 'DESC' ), true ) ? $order : 'DESC';
		$rows = filter_var( $atts['rows'], FILTER_VALIDATE_INT );
		$rows = in_array( $rows, array( 1, 2 ), true ) ? $rows : 2;
		$speed = is_numeric( $atts['speed'] ) ? (float) $atts['speed'] : 0.25;
		$speed = ( $speed >= 0 && $speed <= 2 ) ? $speed : 0.25;

		$query = new WP_Query(
			array(
				'post_type'              => self::POST_TYPE,
				'post_status'            => 'publish',
				'posts_per_page'         => 0 === $limit ? -1 : $limit,
				'order'                  => $order,
				'orderby'                => array( 'meta_value' => $order, 'ID' => $order ),
				'meta_key'               => self::META_REVIEW_DATE,
				'meta_type'              => 'DATE',
				'meta_query'             => array(
					array(
						'key'     => self::META_REVIEW_DATE,
						'value'   => '',
						'compare' => '!=',
					),
				),
				'no_found_rows'          => true,
				'update_post_term_cache' => false,
			)
		);

		$items = array();
		foreach ( $query->posts as $post ) {
			$name = trim( get_the_title( $post ) );
			$text = trim( wp_strip_all_tags( $post->post_content ) );
			if ( '' === $name || '' === $text ) {
				continue;
			}
			$items[] = $post;
		}
		wp_reset_postdata();

		if ( empty( $items ) ) {
			return current_user_can( 'edit_posts' ) ? '<p class="tdm-testimonials-notice">' . esc_html__( 'No complete published testimonials are available.', 'tdm-testimonials' ) . '</p>' : '';
		}

		$rows = min( $rows, count( $items ) );
		$row_items = array_fill( 0, $rows, array() );
		foreach ( $items as $index => $post ) {
			$row_items[ $index % $rows ][] = $post;
		}

		$this->enqueue_frontend_assets();
		++$this->instance_count;
		$instance_id = 'tdm-testimonials-' . $this->instance_count;

		ob_start();
		?>
		<div id="<?php echo esc_attr( $instance_id ); ?>" class="tdm-testimonials" data-tdm-testimonials data-speed="<?php echo esc_attr( $speed ); ?>">
			<div class="tdm-smoke tdm-smoke--left" aria-hidden="true"></div>
			<div class="tdm-smoke tdm-smoke--right" aria-hidden="true"></div>
			<?php foreach ( $row_items as $row_index => $posts ) : ?>
				<div class="tdm-testimonial-row"<?php echo 1 === $row_index ? ' data-direction="reverse"' : ''; ?> tabindex="0" role="region" aria-label="<?php echo esc_attr( sprintf( __( 'Client testimonials, row %d. Use left and right arrow keys to scroll.', 'tdm-testimonials' ), $row_index + 1 ) ); ?>">
					<div class="tdm-testimonial-track">
						<?php foreach ( $posts as $post ) : ?>
							<?php echo $this->render_card( $post ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped in method. ?>
						<?php endforeach; ?>
					</div>
				</div>
			<?php endforeach; ?>
		</div>
		<?php
		return ob_get_clean();
	}

	/** Render a safely escaped testimonial card. */
	private function render_card( $post ) {
		$name       = get_the_title( $post );
		$content    = apply_filters( 'the_content', $post->post_content );
		$rating     = $this->sanitize_rating( get_post_meta( $post->ID, self::META_RATING, true ) ?: 5 );
		$avatar_id  = absint( get_post_meta( $post->ID, self::META_AVATAR, true ) );
		$review_date = get_post_meta( $post->ID, self::META_REVIEW_DATE, true );
		$date_label = $this->format_review_date( $review_date );
		$initial    = function_exists( 'mb_substr' ) ? mb_strtoupper( mb_substr( trim( $name ), 0, 1 ) ) : strtoupper( substr( trim( $name ), 0, 1 ) );

		ob_start();
		?>
		<article class="tdm-testimonial-card">
			<div class="tdm-card-top">
				<div class="tdm-stars" role="img" aria-label="<?php echo esc_attr( sprintf( __( '%1$d out of %2$d stars', 'tdm-testimonials' ), $rating, 5 ) ); ?>">
					<?php for ( $i = 1; $i <= 5; $i++ ) : ?><span class="<?php echo $i <= $rating ? 'is-filled' : 'is-empty'; ?>" aria-hidden="true">&#9733;</span><?php endfor; ?>
				</div>
				<span class="tdm-google" role="img" aria-label="<?php esc_attr_e( 'Google review', 'tdm-testimonials' ); ?>">G</span>
			</div>
			<blockquote><?php echo wp_kses_post( $content ); ?></blockquote>
			<div class="tdm-reviewer">
				<?php if ( $avatar_id && wp_attachment_is_image( $avatar_id ) ) : ?>
					<span class="tdm-avatar" aria-hidden="true"><?php echo wp_kses_post( wp_get_attachment_image( $avatar_id, 'thumbnail', false, array( 'loading' => 'lazy', 'alt' => '' ) ) ); ?></span>
				<?php else : ?>
					<span class="tdm-avatar" aria-hidden="true"><?php echo esc_html( $initial ); ?></span>
				<?php endif; ?>
				<div><strong><?php echo esc_html( $name ); ?></strong><span><?php echo esc_html( $date_label ); ?></span></div>
			</div>
		</article>
		<?php
		return ob_get_clean();
	}

	/** Format past dates relatively and future dates as site-formatted dates. */
	private function format_review_date( $date ) {
		$review_date = DateTimeImmutable::createFromFormat( '!Y-m-d', $date, wp_timezone() );
		if ( ! $review_date || $review_date->format( 'Y-m-d' ) !== $date ) {
			return '';
		}

		$current = current_datetime();
		if ( $review_date > $current ) {
			return wp_date( get_option( 'date_format' ), $review_date->getTimestamp(), wp_timezone() );
		}

		return sprintf( __( '%s ago', 'tdm-testimonials' ), human_time_diff( $review_date->getTimestamp(), $current->getTimestamp() ) );
	}

	/** Activation hook. */
	public static function activate() {
		self::instance()->register_post_type();
		flush_rewrite_rules();
	}

	/** Deactivation hook. */
	public static function deactivate() {
		flush_rewrite_rules();
	}
}
