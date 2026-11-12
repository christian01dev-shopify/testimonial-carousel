<?php
/**
 * GitHub Releases update integration.
 *
 * @package TDM_Testimonials
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class TDM_Testimonials_Updater {
	const API_URL       = 'https://api.github.com/repos/christian01dev-shopify/testimonial-carousel/releases/latest';
	const REPOSITORY_URL = 'https://github.com/christian01dev-shopify/testimonial-carousel';
	const ASSET_NAME    = 'tdm-testimonials.zip';
	const CACHE_KEY     = 'tdm_testimonials_github_release';

	/** @var TDM_Testimonials_Updater|null */
	private static $instance = null;

	/** @var string */
	private $plugin_basename;

	/** @return TDM_Testimonials_Updater */
	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	private function __construct() {
		$this->plugin_basename = plugin_basename( TDM_TESTIMONIALS_FILE );

		add_filter( 'pre_set_site_transient_update_plugins', array( $this, 'check_for_update' ) );
		add_filter( 'plugins_api', array( $this, 'plugin_information' ), 20, 3 );
		add_action( 'upgrader_process_complete', array( $this, 'clear_cache_after_upgrade' ), 10, 2 );
		add_action( 'load-update-core.php', array( $this, 'clear_cache_for_manual_check' ) );
	}

	/**
	 * Add a GitHub release to WordPress' update data when it is newer.
	 *
	 * @param object $transient Update transient.
	 * @return object
	 */
	public function check_for_update( $transient ) {
		if ( ! is_object( $transient ) ) {
			$transient = new stdClass();
		}

		$release = $this->get_release();
		if ( ! $release || ! version_compare( $release['version'], TDM_TESTIMONIALS_VERSION, '>' ) ) {
			return $transient;
		}

		if ( ! isset( $transient->response ) || ! is_array( $transient->response ) ) {
			$transient->response = array();
		}

		$transient->response[ $this->plugin_basename ] = (object) array(
			'id'           => self::REPOSITORY_URL,
			'slug'         => 'tdm-testimonials',
			'plugin'       => $this->plugin_basename,
			'new_version'  => $release['version'],
			'url'          => $release['html_url'],
			'package'      => $release['package'],
			'requires'     => '6.4',
			'requires_php' => '7.4',
		);

		return $transient;
	}

	/**
	 * Supply content for the WordPress version-details modal.
	 *
	 * @param false|object|array $result Existing result.
	 * @param string             $action API action.
	 * @param object             $args   API arguments.
	 * @return false|object|array
	 */
	public function plugin_information( $result, $action, $args ) {
		if ( 'plugin_information' !== $action || ! is_object( $args ) || empty( $args->slug ) || 'tdm-testimonials' !== $args->slug ) {
			return $result;
		}

		$release = $this->get_release();
		if ( ! $release ) {
			return $result;
		}

		return (object) array(
			'name'          => 'TDM Testimonials',
			'slug'          => 'tdm-testimonials',
			'version'       => $release['version'],
			'author'        => '<a href="' . esc_url( self::REPOSITORY_URL ) . '">TDM</a>',
			'homepage'      => self::REPOSITORY_URL,
			'requires'      => '6.4',
			'requires_php'  => '7.4',
			'download_link' => $release['package'],
			'sections'      => array(
				'description' => esc_html__( 'Manage and display responsive, accessible testimonial carousels.', 'tdm-testimonials' ),
				'changelog'   => wp_kses_post( wpautop( $release['body'] ) ),
			),
		);
	}

	/**
	 * Clear cached release data after this plugin is updated.
	 *
	 * @param WP_Upgrader $upgrader Upgrader instance.
	 * @param array       $options  Upgrade context.
	 */
	public function clear_cache_after_upgrade( $upgrader, $options ) {
		unset( $upgrader );

		if ( empty( $options['action'] ) || 'update' !== $options['action'] || empty( $options['type'] ) || 'plugin' !== $options['type'] ) {
			return;
		}

		$plugins = isset( $options['plugins'] ) && is_array( $options['plugins'] ) ? $options['plugins'] : array();
		if ( ( isset( $options['plugin'] ) && $this->plugin_basename === $options['plugin'] ) || in_array( $this->plugin_basename, $plugins, true ) ) {
			delete_site_transient( self::CACHE_KEY );
		}
	}

	/** Let an authorized WordPress "Check again" request bypass our API cache. */
	public function clear_cache_for_manual_check() {
		if ( current_user_can( 'update_plugins' ) && isset( $_GET['force-check'] ) && '1' === sanitize_text_field( wp_unslash( $_GET['force-check'] ) ) ) {
			delete_site_transient( self::CACHE_KEY );
		}
	}

	/**
	 * Fetch and validate the latest public GitHub release.
	 *
	 * @return array|false
	 */
	private function get_release() {
		$cached = get_site_transient( self::CACHE_KEY );
		if ( is_array( $cached ) && isset( $cached['status'] ) ) {
			return 'ok' === $cached['status'] ? $cached['release'] : false;
		}

		$response = wp_remote_get(
			self::API_URL,
			array(
				'timeout' => 8,
				'headers' => array(
					'Accept'               => 'application/vnd.github+json',
					'X-GitHub-Api-Version' => '2022-11-28',
					'User-Agent'           => 'TDM-Testimonials/' . TDM_TESTIMONIALS_VERSION,
				),
			)
		);

		if ( is_wp_error( $response ) || 200 !== wp_remote_retrieve_response_code( $response ) ) {
			$this->cache_failure();
			return false;
		}

		$data = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( ! is_array( $data ) || ! empty( $data['draft'] ) || ! empty( $data['prerelease'] ) ) {
			$this->cache_failure();
			return false;
		}

		$version = isset( $data['tag_name'] ) ? ltrim( sanitize_text_field( $data['tag_name'] ), 'vV' ) : '';
		if ( ! preg_match( '/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/', $version ) ) {
			$this->cache_failure();
			return false;
		}

		$package = '';
		$assets  = isset( $data['assets'] ) && is_array( $data['assets'] ) ? $data['assets'] : array();
		foreach ( $assets as $asset ) {
			if ( isset( $asset['name'], $asset['browser_download_url'] ) && self::ASSET_NAME === $asset['name'] ) {
				$package = esc_url_raw( $asset['browser_download_url'] );
				break;
			}
		}

		if ( ! $package ) {
			$this->cache_failure();
			return false;
		}

		$release = array(
			'version'  => $version,
			'package'  => $package,
			'html_url' => isset( $data['html_url'] ) ? esc_url_raw( $data['html_url'] ) : self::REPOSITORY_URL,
			'body'     => isset( $data['body'] ) ? sanitize_textarea_field( $data['body'] ) : '',
		);

		set_site_transient(
			self::CACHE_KEY,
			array(
				'status'  => 'ok',
				'release' => $release,
			),
			12 * HOUR_IN_SECONDS
		);

		return $release;
	}

	/** Cache unsuccessful requests briefly to avoid repeated API calls. */
	private function cache_failure() {
		set_site_transient( self::CACHE_KEY, array( 'status' => 'error' ), HOUR_IN_SECONDS );
	}
}
